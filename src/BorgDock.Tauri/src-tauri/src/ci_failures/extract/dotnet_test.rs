use std::sync::LazyLock;

use regex::Regex;

use super::{number, pattern};
use crate::ci_failures::signal::{Signal, SignalKind, MAX_EXCERPT_LINES, MAX_FRAMES};

/// `Failed Ns.Class.Method(card: "visa") [3 ms]`, VSTest's line for a failed test.
static FAILED: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^\s*Failed\s+(\S+?(?:\(.*\))?)(?:\s+\[[^\]]*\])?\s*$"));
static OTHER_RESULT: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\s*(?:Passed|Skipped)\s"));
static FRAME: LazyLock<Regex> = LazyLock::new(|| pattern(r"^at (.+?)(?: in (.+):line (\d+))?$"));
static EXCEPTION: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^((?:[A-Za-z_]\w*\.)+[A-Za-z_]\w*(?:Exception|Error))\b"));
/// `Assert.Equal() Failure` (xUnit) and `Assert.AreEqual failed.` (MSTest).
static ASSERT: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^(Assert\.\w+)(?:\(\))? (?:Failure|failed)\b"));
static NUNIT_ONE_LINE: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^Expected:\s*(.*?)\s+But was:\s*(.*)$"));
static MSTEST_VALUES: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"Expected:<(.*?)>\.?\s*Actual:<(.*?)>"));

/// What the TypeScript parser kept of a failure; the block is read further for frames.
const EXCERPT_LINES: usize = 10;
const SECTION_HEADERS: [&str; 4] = [
    "Error Message:",
    "Stack Trace:",
    "Standard Output Messages:",
    "Standard Error Messages:",
];
const FRAMEWORK_FRAMES: [&str; 4] = ["System.", "Microsoft.", "Xunit.", "NUnit."];
const NUNIT_ASSERTION: &str = "NUnit.Framework.AssertionException";

pub fn parse(lines: &[&str]) -> Vec<Signal> {
    lines
        .iter()
        .enumerate()
        .filter_map(|(index, line)| {
            let name = FAILED.captures(line)?.get(1)?.as_str();
            Some(failure(name, &block(lines, index)))
        })
        .collect()
}

/// The trimmed lines after a `Failed` line, up to a blank line or the next
/// result. NUnit leaves a blank line before its stack trace.
fn block<'a>(lines: &[&'a str], header: usize) -> Vec<&'a str> {
    let mut block = Vec::new();
    for (index, line) in lines.iter().enumerate().skip(header + 1) {
        let trimmed = line.trim();
        if block.len() == MAX_EXCERPT_LINES
            || trimmed.starts_with("Failed ")
            || OTHER_RESULT.is_match(line)
        {
            break;
        }
        if trimmed.is_empty() {
            let stack_follows = lines
                .get(index + 1)
                .is_some_and(|next| next.trim() == "Stack Trace:");
            if stack_follows {
                continue;
            }
            break;
        }
        block.push(trimmed);
    }
    block
}

fn failure(name: &str, block: &[&str]) -> Signal {
    let (test_id, params) = match name.split_once('(') {
        Some((id, rest)) if rest.ends_with(')') => (id, Some(&rest[..rest.len() - 1])),
        _ => (name, None),
    };
    let message = block
        .iter()
        .find(|line| !SECTION_HEADERS.contains(line))
        .map_or_else(|| format!("Test failed: {name}"), |line| line.to_string());
    let (expected, actual) = values(block);
    let frames = frames(block);
    let location = frames.iter().find_map(|frame| frame.location.clone());
    Signal {
        test_id: Some(test_id.to_string()),
        params: params.map(str::to_string),
        path: location.as_ref().map(|(path, _)| path.clone()),
        line: location.and_then(|(_, line)| line),
        error_class: error_class(block),
        expected,
        actual,
        excerpt: block
            .iter()
            .take(EXCERPT_LINES)
            .map(|line| line.to_string())
            .collect(),
        frames: frames.into_iter().map(|frame| frame.method).collect(),
        ..Signal::new(SignalKind::Test, "dotnet-test", message)
    }
}

fn error_class(block: &[&str]) -> Option<String> {
    let named = block.iter().find_map(|line| {
        EXCEPTION
            .captures(line)
            .or_else(|| ASSERT.captures(line))
            .map(|captures| captures[1].to_string())
    });
    let nunit = || {
        block
            .iter()
            .any(|line| line.starts_with("But was:") || NUNIT_ONE_LINE.is_match(line))
            .then(|| NUNIT_ASSERTION.to_string())
    };
    named.or_else(nunit)
}

/// xUnit's `Expected:` / `Actual:` lines, NUnit's `Expected:` / `But was:` and
/// MSTest's `Expected:<1>. Actual:<2>.`.
fn values(block: &[&str]) -> (Option<String>, Option<String>) {
    let mut expected = None;
    let mut actual = None;
    for line in block {
        if let Some(captures) = NUNIT_ONE_LINE
            .captures(line)
            .or_else(|| MSTEST_VALUES.captures(line))
        {
            expected.get_or_insert_with(|| captures[1].trim().to_string());
            actual.get_or_insert_with(|| captures[2].trim().to_string());
        } else if let Some(value) = line.strip_prefix("Expected:") {
            expected.get_or_insert_with(|| value.trim().to_string());
        } else if let Some(value) = line
            .strip_prefix("Actual:")
            .or_else(|| line.strip_prefix("But was:"))
        {
            actual.get_or_insert_with(|| value.trim().to_string());
        }
    }
    (expected, actual)
}

struct Frame {
    method: String,
    location: Option<(String, Option<u32>)>,
}

/// Application frames only: the runtime and the test framework sit under every test.
fn frames(block: &[&str]) -> Vec<Frame> {
    block
        .iter()
        .filter_map(|line| FRAME.captures(line))
        .filter(|captures| {
            !FRAMEWORK_FRAMES
                .iter()
                .any(|prefix| captures[1].starts_with(prefix))
        })
        .map(|captures| Frame {
            method: captures[1].to_string(),
            location: captures.get(2).map(|path| {
                (
                    path.as_str().to_string(),
                    captures.get(3).and_then(|line| number(line.as_str())),
                )
            }),
        })
        .take(MAX_FRAMES)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::super::extract;
    use super::*;

    const XUNIT: &str = include_str!("../fixtures/logs/dotnet-xunit.log");

    #[test]
    fn reads_xunit_failures_from_a_job_log() {
        let extraction = extract(
            XUNIT,
            Some("Run dotnet test --no-build --configuration Release"),
        );
        assert!(extraction.step_found);
        let signals = extraction.signals;
        assert_eq!(signals.len(), 2, "{signals:#?}");

        let equal = &signals[0];
        assert_eq!(equal.kind, SignalKind::Test);
        assert_eq!(equal.parser, "dotnet-test");
        assert_eq!(
            equal.test_id.as_deref(),
            Some("Fsp.Orders.Tests.PricingTests.Applies_volume_discount")
        );
        assert_eq!(equal.params, None);
        assert_eq!(equal.message, "Assert.Equal() Failure: Values differ");
        assert_eq!(equal.error_class.as_deref(), Some("Assert.Equal"));
        assert_eq!(equal.expected.as_deref(), Some("90.00"));
        assert_eq!(equal.actual.as_deref(), Some("100.00"));
        assert_eq!(
            equal.frames,
            vec!["Fsp.Orders.Tests.PricingTests.Applies_volume_discount()"]
        );
        assert_eq!(
            equal.path.as_deref(),
            Some("/home/runner/work/fsp/fsp/tests/Fsp.Orders.Tests/PricingTests.cs")
        );
        assert_eq!(equal.line, Some(48));

        let theory = &signals[1];
        assert_eq!(
            theory.test_id.as_deref(),
            Some("Fsp.Orders.Tests.PaymentTests.Pays_with_card")
        );
        assert_eq!(
            theory.params.as_deref(),
            Some("card: \"visa\", amount: 12.5")
        );
        assert_eq!(
            theory.error_class.as_deref(),
            Some("System.InvalidOperationException")
        );
        assert_eq!(
            theory.frames,
            vec![
                "Fsp.Orders.Payments.CardGateway.Charge(Card card, Decimal amount)",
                "Fsp.Orders.Tests.PaymentTests.Pays_with_card(String card, Decimal amount)",
            ]
        );
    }

    #[test]
    fn reads_nunit_expected_but_was() {
        let signals = parse(&[
            "  Failed Fsp.Tests.MathTests.Divides [12 ms]",
            "  Error Message:",
            "     Expected: 2",
            "  But was:  3",
            "",
            "  Stack Trace:",
            "     at Fsp.Tests.MathTests.Divides() in D:\\a\\fsp\\fsp\\tests\\MathTests.cs:line 20",
            "",
        ]);
        assert_eq!(signals.len(), 1);
        let signal = &signals[0];
        assert_eq!(signal.message, "Expected: 2");
        assert_eq!(signal.error_class.as_deref(), Some(NUNIT_ASSERTION));
        assert_eq!(signal.expected.as_deref(), Some("2"));
        assert_eq!(signal.actual.as_deref(), Some("3"));
        assert_eq!(signal.frames, vec!["Fsp.Tests.MathTests.Divides()"]);
        assert_eq!(signal.line, Some(20));
    }

    #[test]
    fn reads_mstest_inline_values() {
        let signals = parse(&[
            "  Failed Works [5 ms]",
            "  Error Message:",
            "   Assert.AreEqual failed. Expected:<1>. Actual:<2>. ",
        ]);
        assert_eq!(signals[0].error_class.as_deref(), Some("Assert.AreEqual"));
        assert_eq!(signals[0].expected.as_deref(), Some("1"));
        assert_eq!(signals[0].actual.as_deref(), Some("2"));
    }

    #[test]
    fn reads_an_exception_type_before_the_assertion() {
        let signals = parse(&[
            "  Failed Fsp.Tests.A",
            "Xunit.Sdk.EqualException : Assert.Equal() Failure",
            "Expected: \"a\"",
            " Actual: \"b\"",
        ]);
        assert_eq!(
            signals[0].error_class.as_deref(),
            Some("Xunit.Sdk.EqualException")
        );
        assert_eq!(signals[0].expected.as_deref(), Some("\"a\""));
        assert_eq!(signals[0].actual.as_deref(), Some("\"b\""));
    }

    #[test]
    fn ignores_lines_that_only_start_with_failed() {
        assert!(parse(&[
            "Failed to restore /home/runner/work/fsp/fsp/src/Api/Api.csproj",
            "Failed!  - Failed:     1, Passed:    41, Skipped:     0, Total:    42",
        ])
        .is_empty());
    }

    #[test]
    fn names_a_test_without_context() {
        let signals = parse(&["  Failed Fsp.Tests.A [1 ms]"]);
        assert_eq!(signals[0].message, "Test failed: Fsp.Tests.A");
        assert!(signals[0].excerpt.is_empty());
    }
}
