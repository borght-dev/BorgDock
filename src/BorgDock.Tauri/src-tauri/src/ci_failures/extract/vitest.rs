use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;

use super::{excerpt, expected_received, number, pattern};
use crate::ci_failures::signal::{Signal, SignalKind};

/// ` FAIL  src/a.test.ts > suite > test`, or ` FAIL  src/a.test.ts [ src/a.test.ts ]`
/// when the file itself failed. Workspace projects prefix `|name|` (Vitest 1-2)
/// or a padded label (` FAIL  unit  src/…`, Vitest 3+).
static FAIL: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r"^\s*FAIL\s+(?:\|[^|]+\|\s+|[A-Za-z][\w.-]*\s{2,})?(\S+)(?:\s+>\s+(.+?)|\s+\[[^\]]*\])\s*$",
    )
});
/// `× suite > test 9ms`, the run's line for a failed test.
static CROSSED: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r"^\s*[×✗]\s+(.+?)(?:\s+\(retry x\d+\))?(?:\s+\d+(?:\.\d+)?m?s)?\s*$")
});
/// `❯ src/a.test.ts (3 tests | 1 failed) 14ms`: the file the `×` lines under it belong to.
static FILE: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\s*❯\s+(\S+)\s+\(\d+ tests?\b"));
static ARROW: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\s*→\s+(.+)$"));
static FRAME: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\s*❯\s+(.+?)\s*$"));
static LOCATION: LazyLock<Regex> = LazyLock::new(|| pattern(r"(\S+):(\d+):(\d+)\)?$"));
static ERROR_CLASS: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^(\w*(?:Error|Exception))(?:\s*\[[^\]]*\])?:"));

/// The failure details after a `FAIL` header; Vitest ends each with a `⎯` rule.
const BLOCK_LINES: usize = 60;

/// `FAIL` headers carry the error; a `×` line is only used for a test they don't name.
pub fn parse(lines: &[&str]) -> Vec<Signal> {
    let mut signals = failures(lines);
    let named: HashSet<Option<String>> = signals
        .iter()
        .map(|signal| signal.test_id.clone())
        .collect();
    signals.extend(
        crossed(lines)
            .into_iter()
            .filter(|signal| !named.contains(&signal.test_id)),
    );
    signals
}

fn failures(lines: &[&str]) -> Vec<Signal> {
    let mut signals = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        if !FAIL.is_match(lines[index]) {
            index += 1;
            continue;
        }
        // Tests that failed the same way share one error under consecutive headers.
        let headers = index;
        while index < lines.len() && FAIL.is_match(lines[index]) {
            index += 1;
        }
        let end = block_end(lines, index);
        let details = Details::of(&lines[index..end]);
        signals.extend(
            lines[headers..index]
                .iter()
                .filter_map(|header| details.signal(header)),
        );
        index = end;
    }
    signals
}

fn block_end(lines: &[&str], start: usize) -> usize {
    lines[start..]
        .iter()
        .take(BLOCK_LINES)
        .position(|line| {
            let trimmed = line.trim();
            trimmed.starts_with('⎯') || trimmed.starts_with("Test Files ") || FAIL.is_match(line)
        })
        .map_or_else(
            || (start + BLOCK_LINES).min(lines.len()),
            |offset| start + offset,
        )
}

struct Details {
    message: Option<String>,
    error_class: Option<String>,
    expected: Option<String>,
    actual: Option<String>,
    location: Option<(String, Option<u32>, Option<u32>)>,
    frames: Vec<String>,
    excerpt: Vec<String>,
}

impl Details {
    fn of(block: &[&str]) -> Self {
        let message = block
            .iter()
            .map(|line| line.trim())
            .find(|line| !line.is_empty());
        let frames: Vec<String> = block
            .iter()
            .filter_map(|line| FRAME.captures(line))
            .map(|captures| captures[1].to_string())
            .filter(|frame| !frame.contains("node_modules"))
            .collect();
        let location = frames
            .iter()
            .find_map(|frame| LOCATION.captures(frame))
            .map(|captures| {
                (
                    captures[1].to_string(),
                    number(&captures[2]),
                    number(&captures[3]),
                )
            });
        let (expected, actual) = diff(block).unwrap_or_else(|| expected_received(block));
        Self {
            error_class: message
                .and_then(|line| ERROR_CLASS.captures(line))
                .map(|captures| captures[1].to_string()),
            message: message.map(str::to_string),
            expected,
            actual,
            location,
            frames,
            excerpt: excerpt(block),
        }
    }

    fn signal(&self, header: &str) -> Option<Signal> {
        let captures = FAIL.captures(header)?;
        let file = &captures[1];
        let test_id = match captures.get(2) {
            Some(name) => format!("{file} > {}", name.as_str()),
            None => file.to_string(),
        };
        let message = self
            .message
            .clone()
            .unwrap_or_else(|| format!("Test failed: {test_id}"));
        let (path, line, column) = match &self.location {
            Some((path, line, column)) => (path.clone(), *line, *column),
            None => (file.to_string(), None, None),
        };
        Some(Signal {
            test_id: Some(test_id),
            path: Some(path),
            line,
            column,
            error_class: self.error_class.clone(),
            expected: self.expected.clone(),
            actual: self.actual.clone(),
            excerpt: self.excerpt.clone(),
            frames: self.frames.clone(),
            ..Signal::new(SignalKind::Test, "vitest", message)
        })
    }
}

/// The `- Expected` / `+ Received` block: removed lines are the expected
/// value, added lines the received one.
fn diff(block: &[&str]) -> Option<(Option<String>, Option<String>)> {
    let header = block.windows(2).position(|pair| {
        pair[0].trim().starts_with("- Expected") && pair[1].trim().starts_with("+ Received")
    })?;
    let body: Vec<&str> = block[header + 2..]
        .iter()
        .copied()
        .skip_while(|line| line.trim().is_empty())
        .take_while(|line| !line.trim().is_empty())
        .collect();
    let side = |sign: char| {
        let values: Vec<&str> = body
            .iter()
            .filter_map(|line| line.trim_start().strip_prefix(sign))
            .map(|value| value.strip_prefix(' ').unwrap_or(value).trim_end())
            .collect();
        (!values.is_empty()).then(|| values.join("\n"))
    };
    Some((side('-'), side('+')))
}

/// `×` lines name the test relative to the file listed above them.
fn crossed(lines: &[&str]) -> Vec<Signal> {
    let mut signals = Vec::new();
    let mut file: Option<&str> = None;
    for (index, line) in lines.iter().enumerate() {
        if let Some(captures) = FILE.captures(line) {
            file = captures.get(1).map(|path| path.as_str());
            continue;
        }
        let (Some(file), Some(captures)) = (file, CROSSED.captures(line)) else {
            continue;
        };
        let test_id = format!("{file} > {}", &captures[1]);
        let reasons: Vec<&str> = lines[index + 1..]
            .iter()
            .map_while(|line| ARROW.captures(line).and_then(|reason| reason.get(1)))
            .map(|reason| reason.as_str())
            .collect();
        let message = reasons.first().map_or_else(
            || format!("Test failed: {test_id}"),
            |reason| reason.to_string(),
        );
        signals.push(Signal {
            test_id: Some(test_id),
            path: Some(file.to_string()),
            excerpt: reasons.iter().map(|reason| reason.to_string()).collect(),
            ..Signal::new(SignalKind::Test, "vitest", message)
        });
    }
    signals
}

#[cfg(test)]
mod tests {
    use super::super::extract;
    use super::*;

    const FAILURE: &str = include_str!("../fixtures/logs/vitest-failure.log");

    #[test]
    fn reads_vitest_failures_from_a_job_log() {
        let extraction = extract(FAILURE, Some("Run bun run test"));
        assert!(extraction.step_found);
        let signals = extraction.signals;
        assert_eq!(signals.len(), 3, "{signals:#?}");

        let discount = &signals[0];
        assert_eq!(discount.kind, SignalKind::Test);
        assert_eq!(discount.parser, "vitest");
        assert_eq!(
            discount.test_id.as_deref(),
            Some("src/services/__tests__/cart.test.ts > cart > applies the discount")
        );
        assert_eq!(
            discount.message,
            "AssertionError: expected 100 to be 90 // Object.is equality"
        );
        assert_eq!(discount.error_class.as_deref(), Some("AssertionError"));
        assert_eq!(discount.expected.as_deref(), Some("90"));
        assert_eq!(discount.actual.as_deref(), Some("100"));
        assert_eq!(
            discount.path.as_deref(),
            Some("src/services/__tests__/cart.test.ts")
        );
        assert_eq!(discount.line, Some(24));
        assert_eq!(discount.column, Some(31));
        assert_eq!(
            discount.frames,
            vec!["src/services/__tests__/cart.test.ts:24:31"]
        );

        let shared = [&signals[1], &signals[2]];
        assert_eq!(
            shared.map(|signal| signal.test_id.as_deref().unwrap_or_default()),
            [
                "src/components/__tests__/CartSummary.test.tsx > CartSummary > renders the total",
                "src/components/__tests__/CartSummary.test.tsx > CartSummary > renders the savings",
            ]
        );
        assert!(shared.iter().all(|signal| {
            signal.message == "TypeError: Cannot read properties of undefined (reading 'toFixed')"
                && signal.error_class.as_deref() == Some("TypeError")
                && signal.path.as_deref() == Some("src/components/CartSummary.tsx")
                && signal.line == Some(18)
        }));
        assert_eq!(
            signals[1].frames,
            vec![
                "formatMoney src/components/CartSummary.tsx:18:22",
                "src/components/__tests__/CartSummary.test.tsx:12:5",
            ]
        );
    }

    #[test]
    fn reads_a_file_that_failed_to_load() {
        let signals = parse(&[
            " FAIL  src/a.test.ts [ src/a.test.ts ]",
            "Error: Failed to load url ./missing (resolved id: ./missing) in /app/src/a.test.ts. Does the file exist?",
            "⎯⎯⎯⎯",
        ]);
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].test_id.as_deref(), Some("src/a.test.ts"));
        assert_eq!(signals[0].error_class.as_deref(), Some("Error"));
    }

    #[test]
    fn uses_crossed_lines_when_the_failure_section_is_missing() {
        let signals = parse(&[
            " ❯ src/a.test.ts (2 tests | 1 failed) 14ms",
            "   ✓ suite > passes 1ms",
            "   × suite > breaks 9ms",
            "     → expected 1 to be 2 // Object.is equality",
        ]);
        assert_eq!(signals.len(), 1);
        assert_eq!(
            signals[0].test_id.as_deref(),
            Some("src/a.test.ts > suite > breaks")
        );
        assert_eq!(
            signals[0].message,
            "expected 1 to be 2 // Object.is equality"
        );
    }

    #[test]
    fn reads_failures_of_a_workspace_project() {
        let signals = parse(&[
            " FAIL  unit  src/widgets/preview.test.tsx > previews in edit mode > shows its sample record",
            " FAIL  unit  src/widgets/preview.test.tsx > previews in view mode > shows its sample record",
            "AssertionError: expected [ Array(1) ] to deeply equal []",
            " ❯ src/widgets/preview.test.tsx:88:7",
            "⎯⎯⎯⎯",
        ]);
        assert_eq!(signals.len(), 2, "{signals:#?}");
        assert_eq!(
            signals[0].test_id.as_deref(),
            Some("src/widgets/preview.test.tsx > previews in edit mode > shows its sample record")
        );
        assert_eq!(signals[1].error_class.as_deref(), Some("AssertionError"));
    }

    #[test]
    fn ignores_jest_file_lines() {
        assert!(parse(&["FAIL src/cart.test.ts", "FAIL src/cart.test.ts (5.2 s)"]).is_empty());
    }
}
