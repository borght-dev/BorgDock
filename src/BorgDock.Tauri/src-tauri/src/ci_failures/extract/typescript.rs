use std::sync::LazyLock;

use regex::Regex;

use super::{number, pattern, without_annotation};
use crate::ci_failures::signal::{Signal, SignalKind};

/// `src/a.ts(12,5): error TS2322: message`, tsc's plain format.
static TSC: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$"));
/// `src/a.ts:12:5 - error TS2322: message`, tsc's `--pretty` format.
static TSC_PRETTY: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^(.+?):(\d+):(\d+)\s+-\s+error\s+(TS\d+):\s*(.+)$"));
/// `src/a.ts:10:5 - error message`.
static ESLINT_INLINE: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^(.+?):(\d+):(\d+)\s+-\s+error\s+(.+)$"));
/// `  10:5  error  message  rule-id`, under the line naming the file (ESLint's default formatter).
static ESLINT_STYLISH: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^\s+(\d+):(\d+)\s+error\s+(.+?)\s*$"));
static STYLISH_FILE: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\S*[\\/]\S*\.[A-Za-z]+$"));
static RULE_ID: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^(?:@[\w-]+/)?(?:[\w-]+/)?[a-z][\w-]*$"));

/// tsc errors first, then ESLint's.
pub fn parse(lines: &[&str]) -> Vec<Signal> {
    let mut signals: Vec<Signal> = lines.iter().filter_map(|line| tsc(line)).collect();
    signals.extend(eslint(lines));
    signals
}

fn tsc(line: &str) -> Option<Signal> {
    let captures = TSC.captures(line).or_else(|| TSC_PRETTY.captures(line))?;
    Some(Signal {
        path: Some(without_annotation(&captures[1]).to_string()),
        line: number(&captures[2]),
        column: number(&captures[3]),
        code: Some(captures[4].to_string()),
        ..Signal::new(SignalKind::Compile, "typescript", captures[5].trim())
    })
}

fn eslint(lines: &[&str]) -> Vec<Signal> {
    let mut signals = Vec::new();
    let mut file: Option<&str> = None;
    for line in lines {
        if let Some(captures) = ESLINT_INLINE.captures(line) {
            if !TSC_PRETTY.is_match(line) {
                signals.push(lint(
                    captures[1].trim(),
                    &captures[2],
                    &captures[3],
                    &captures[4],
                ));
            }
        } else if let Some(captures) = ESLINT_STYLISH.captures(line) {
            if let Some(file) = file {
                signals.push(lint(file, &captures[1], &captures[2], &captures[3]));
            }
        } else if !line.starts_with([' ', '\t']) {
            file = STYLISH_FILE.is_match(line).then_some(line);
        }
    }
    signals
}

fn lint(path: &str, line: &str, column: &str, message: &str) -> Signal {
    let message = message.trim();
    Signal {
        path: Some(path.to_string()),
        line: number(line),
        column: number(column),
        code: rule_id(message),
        ..Signal::new(SignalKind::Lint, "eslint", message)
    }
}

/// The rule ESLint names after the message: two spaces apart in its default
/// formatter, or the whole message. A last word is only a rule when it names a plugin.
fn rule_id(message: &str) -> Option<String> {
    let candidate = match message.rsplit_once("  ") {
        Some((_, last)) => last.trim(),
        None => match message.rsplit_once(' ') {
            None => message,
            Some((_, last)) if last.contains('/') => last,
            Some(_) => return None,
        },
    };
    RULE_ID.is_match(candidate).then(|| candidate.to_string())
}

#[cfg(test)]
mod tests {
    use super::super::extract;
    use super::*;

    const TSC_LOG: &str = include_str!("../fixtures/logs/tsc-errors.log");
    const ESLINT_LOG: &str = include_str!("../fixtures/logs/eslint.log");

    #[test]
    fn reads_tsc_errors_from_a_job_log() {
        let extraction = extract(TSC_LOG, Some("Run bun run typecheck"));
        assert!(extraction.step_found);
        let found: Vec<(&str, Option<u32>, &str, &str)> = extraction
            .signals
            .iter()
            .map(|signal| {
                (
                    signal.path.as_deref().unwrap_or_default(),
                    signal.line,
                    signal.code.as_deref().unwrap_or_default(),
                    signal.parser.as_str(),
                )
            })
            .collect();
        assert_eq!(
            found,
            vec![
                ("src/services/cart.ts", Some(14), "TS2322", "typescript"),
                (
                    "src/components/CartSummary.tsx",
                    Some(31),
                    "TS2339",
                    "typescript"
                ),
                (
                    "src/components/CartSummary.tsx",
                    Some(52),
                    "TS7006",
                    "typescript"
                ),
            ]
        );
        assert_eq!(
            extraction.signals[1].message,
            "Property 'discountTotal' does not exist on type 'Cart'."
        );
    }

    #[test]
    fn reads_the_pretty_format_as_typescript() {
        let signals = parse(&[
            "src/app.ts:12:5 - error TS2322: Type 'string' is not assignable to type 'number'.",
        ]);
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].parser, "typescript");
        assert_eq!(signals[0].code.as_deref(), Some("TS2322"));
        assert_eq!(signals[0].column, Some(5));
    }

    #[test]
    fn reads_eslint_stylish_output_from_a_job_log() {
        let signals = extract(ESLINT_LOG, Some("Run bun run lint")).signals;
        let found: Vec<(&str, Option<u32>, Option<&str>)> = signals
            .iter()
            .map(|signal| {
                (
                    signal.path.as_deref().unwrap_or_default(),
                    signal.line,
                    signal.code.as_deref(),
                )
            })
            .collect();
        assert_eq!(
            found,
            vec![
                (
                    "/home/runner/work/BorgDock/BorgDock/src/BorgDock.Tauri/src/services/cart.ts",
                    Some(12),
                    Some("@typescript-eslint/no-explicit-any")
                ),
                (
                    "/home/runner/work/BorgDock/BorgDock/src/BorgDock.Tauri/src/components/CartSummary.tsx",
                    Some(8),
                    Some("no-unused-vars")
                ),
                (
                    "/home/runner/work/BorgDock/BorgDock/src/BorgDock.Tauri/src/components/CartSummary.tsx",
                    Some(40),
                    Some("react-hooks/exhaustive-deps")
                ),
            ]
        );
        assert!(signals.iter().all(|signal| signal.kind == SignalKind::Lint));
        assert!(signals[1]
            .message
            .starts_with("'formatPrice' is defined but never used  "));
        assert!(signals[1].message.ends_with("  no-unused-vars"));
    }

    #[test]
    fn names_a_rule_only_when_it_is_unambiguous() {
        assert_eq!(rule_id("no-unused-vars").as_deref(), Some("no-unused-vars"));
        assert_eq!(
            rule_id("Unexpected any  @typescript-eslint/no-explicit-any").as_deref(),
            Some("@typescript-eslint/no-explicit-any")
        );
        assert_eq!(
            rule_id("Unexpected any react/no-danger").as_deref(),
            Some("react/no-danger")
        );
        assert_eq!(rule_id("'foo' is defined but never used"), None);
        assert_eq!(rule_id("Parsing error: Unexpected token )"), None);
    }
}
