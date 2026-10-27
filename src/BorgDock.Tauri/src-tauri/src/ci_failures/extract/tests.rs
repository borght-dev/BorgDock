use std::time::{Duration, Instant};

use super::{extract, preprocess};
use crate::ci_failures::signal::{
    Signal, SignalKind, MAX_EXCERPT_LINES, MAX_FRAMES, MAX_LINE_CHARS, MAX_SIGNALS,
};

const NOISE: &str = include_str!("../fixtures/logs/noise-chunk.log");
const VITEST: &str = include_str!("../fixtures/logs/vitest-failure.log");

fn signals(log: &str) -> Vec<Signal> {
    extract(log, None).signals
}

fn of_parser<'a>(signals: &'a [Signal], parser: &str) -> Vec<&'a Signal> {
    signals
        .iter()
        .filter(|signal| signal.parser == parser)
        .collect()
}

mod ported_from_log_parser_ts {
    use super::*;

    #[test]
    fn strips_github_actions_timestamps() {
        assert_eq!(
            preprocess("2024-01-15T10:30:45.1234567Z Hello world"),
            "Hello world"
        );
    }

    #[test]
    fn strips_ansi_escape_codes() {
        assert_eq!(
            preprocess("\x1b[31;1mError\x1b[0m: something failed"),
            "Error: something failed"
        );
    }

    #[test]
    fn parses_msbuild_errors() {
        let signals = signals("src/Foo.cs(42,10): error CS1002: ; expected");
        assert_eq!(signals.len(), 1);
        let signal = &signals[0];
        assert_eq!(signal.kind, SignalKind::Compile);
        assert_eq!(signal.parser, "msbuild");
        assert_eq!(signal.path.as_deref(), Some("src/Foo.cs"));
        assert_eq!(signal.line, Some(42));
        assert_eq!(signal.column, Some(10));
        assert_eq!(signal.code.as_deref(), Some("CS1002"));
        assert_eq!(signal.message, "; expected");
    }

    #[test]
    fn deduplicates_msbuild_errors_by_file_line_and_code() {
        let signals = signals(
            "src/Foo.cs(42,10): error CS1002: ; expected\nsrc/Foo.cs(42,10): error CS1002: ; expected",
        );
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].repeats, 2);
    }

    #[test]
    fn strips_the_annotation_prefix_from_msbuild_paths() {
        let signals = signals("##[error]src/Foo.cs(10,5): error CS0246: Type not found");
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].path.as_deref(), Some("src/Foo.cs"));
    }

    #[test]
    fn reads_every_msbuild_code_shape() {
        let signals = signals(
            "src/A.cs(1,1): error ASPDEPR002: deprecated\nsrc/B.cs(2,2): error NETSDK1100: sdk error\nsrc/C.cs(3,3): error CA1234: code analysis",
        );
        let codes: Vec<&str> = signals
            .iter()
            .filter_map(|signal| signal.code.as_deref())
            .collect();
        assert_eq!(codes, vec!["ASPDEPR002", "NETSDK1100", "CA1234"]);
    }

    #[test]
    fn parses_failed_dotnet_tests() {
        let signals = signals("  Failed MyNamespace.MyTest\n    Expected: 1\n    Actual:   2\n");
        assert_eq!(signals.len(), 1);
        let signal = &signals[0];
        assert_eq!(signal.kind, SignalKind::Test);
        assert_eq!(signal.parser, "dotnet-test");
        assert_eq!(signal.test_id.as_deref(), Some("MyNamespace.MyTest"));
        assert_eq!(signal.message, "Expected: 1");
        assert_eq!(signal.expected.as_deref(), Some("1"));
        assert_eq!(signal.actual.as_deref(), Some("2"));
        assert_eq!(signal.excerpt, vec!["Expected: 1", "Actual:   2"]);
    }

    #[test]
    fn parses_typescript_errors() {
        let signals = signals("src/app.ts(15,3): error TS2322: Type mismatch");
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].parser, "typescript");
        assert_eq!(signals[0].kind, SignalKind::Compile);
        assert_eq!(signals[0].path.as_deref(), Some("src/app.ts"));
        assert_eq!(signals[0].line, Some(15));
        assert_eq!(signals[0].code.as_deref(), Some("TS2322"));
    }

    #[test]
    fn parses_eslint_errors() {
        let signals = signals("src/index.ts:10:5 - error no-unused-vars");
        assert_eq!(signals.len(), 1);
        let signal = &signals[0];
        assert_eq!(signal.kind, SignalKind::Lint);
        assert_eq!(signal.parser, "eslint");
        assert_eq!(signal.path.as_deref(), Some("src/index.ts"));
        assert_eq!(signal.line, Some(10));
        assert_eq!(signal.column, Some(5));
        assert_eq!(signal.code.as_deref(), Some("no-unused-vars"));
        assert_eq!(signal.message, "no-unused-vars");
    }

    #[test]
    fn parses_playwright_failures_and_the_summary() {
        let signals = signals(
            &[
                "1) [chromium] › tests/login.spec.ts:42:10 › Login flow",
                "  Error: expect(locator).toBeVisible()",
                "  Expected: visible",
                "  Received: hidden",
                "",
                "  1 failed",
                "  38 passed (11.0m)",
            ]
            .join("\n"),
        );
        assert_eq!(signals.len(), 2);
        assert_eq!(signals[0].kind, SignalKind::Summary);
        assert!(signals[0].message.contains("failed"));
        let failure = &signals[1];
        assert_eq!(failure.kind, SignalKind::Test);
        assert_eq!(failure.path.as_deref(), Some("tests/login.spec.ts"));
        assert_eq!(failure.line, Some(42));
        assert_eq!(failure.params.as_deref(), Some("chromium"));
        assert_eq!(
            failure.test_id.as_deref(),
            Some("tests/login.spec.ts › Login flow")
        );
        assert_eq!(failure.message, "Error: expect(locator).toBeVisible()");
        assert_eq!(failure.expected.as_deref(), Some("visible"));
        assert_eq!(failure.actual.as_deref(), Some("hidden"));
    }

    #[test]
    fn skips_playwright_without_browser_tags() {
        assert!(of_parser(&signals("1 failed\n38 passed"), "playwright").is_empty());
    }

    #[test]
    fn parses_error_annotations() {
        let signals = signals("##[error]Coverage is below threshold: 80%");
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].kind, SignalKind::Annotation);
        assert_eq!(signals[0].parser, "actions-annotation");
        assert_eq!(signals[0].message, "Coverage is below threshold: 80%");
    }

    #[test]
    fn skips_process_exit_annotations() {
        assert!(signals("##[error]Process completed with exit code 1").is_empty());
    }

    #[test]
    fn skips_msbuild_errors_in_annotations() {
        let signals = signals(
            "src/Foo.cs(42,10): error CS1002: ; expected\n##[error]src/Foo.cs(42,10): error CS1002: ; expected",
        );
        assert!(of_parser(&signals, "actions-annotation").is_empty());
    }

    #[test]
    fn falls_back_to_generic_lines() {
        let signals = signals("FATAL: something went very wrong");
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].kind, SignalKind::Generic);
        assert_eq!(signals[0].parser, "generic");
        assert_eq!(signals[0].message, "FATAL: something went very wrong");
        assert_eq!(signals[0].line, Some(1));
        assert_eq!(signals[0].code, None);
    }

    #[test]
    fn skips_generic_totals() {
        assert!(signals("0 Error(s)").is_empty());
    }
}

/// `first-failure.test.ts`'s log: the excerpt it expected is these two signals.
#[test]
fn reads_the_first_failure_typescript_log() {
    let log = [
        "2026-09-25T10:00:00.0000000Z ##[group]Run bunx tsc -b",
        "src/app.ts(12,5): error TS2322: Type string is not assignable to type number.",
        "src/b.ts(3,1): error TS2304: Cannot find name foo.",
        "##[error]Process completed with exit code 2.",
    ]
    .join("\n");
    for step in [None, Some("Run bunx tsc -b")] {
        let extraction = extract(&log, step);
        assert_eq!(extraction.step_found, step.is_some());
        let found: Vec<(&str, Option<u32>, &str, &str)> = extraction
            .signals
            .iter()
            .map(|signal| {
                (
                    signal.path.as_deref().unwrap_or_default(),
                    signal.line,
                    signal.code.as_deref().unwrap_or_default(),
                    signal.message.as_str(),
                )
            })
            .collect();
        assert_eq!(
            found,
            vec![
                (
                    "src/app.ts",
                    Some(12),
                    "TS2322",
                    "Type string is not assignable to type number."
                ),
                ("src/b.ts", Some(3), "TS2304", "Cannot find name foo."),
            ]
        );
    }
    assert!(signals("all good").is_empty());
}

mod sections {
    use super::*;

    const TWO_STEPS: &str = "\
##[group]Run bun run lint
src/old.ts(1,1): error TS6133: 'x' is declared but its value is never read.
##[endgroup]
##[group]Run bun run test
src/app.ts(12,5): error TS2322: Type string is not assignable to type number.
##[error]Process completed with exit code 1.
Post job cleanup.
src/post.ts(9,9): error TS2304: Cannot find name foo.";

    fn paths(extraction: &super::super::Extraction) -> Vec<&str> {
        extraction
            .signals
            .iter()
            .filter_map(|signal| signal.path.as_deref())
            .collect()
    }

    #[test]
    fn narrows_to_the_failed_step() {
        let extraction = extract(TWO_STEPS, Some("Run bun run test"));
        assert!(extraction.step_found);
        assert_eq!(paths(&extraction), vec!["src/app.ts"]);
    }

    #[test]
    fn matches_the_step_by_its_command() {
        let extraction = extract(TWO_STEPS, Some("  bun run test "));
        assert!(extraction.step_found);
        assert_eq!(paths(&extraction), vec!["src/app.ts"]);
    }

    #[test]
    fn reads_the_whole_log_up_to_the_exit_when_the_step_is_not_found() {
        for step in [Some("Test"), Some("Run bun run Test"), None] {
            let extraction = extract(TWO_STEPS, step);
            assert!(!extraction.step_found);
            assert_eq!(paths(&extraction), vec!["src/old.ts", "src/app.ts"]);
        }
    }

    #[test]
    fn starts_at_the_last_header_for_the_step() {
        let log = "\
##[group]Run bun run test
src/first.ts(1,1): error TS2322: first
##[group]Run bun run test
src/second.ts(2,2): error TS2322: second";
        let extraction = extract(log, Some("Run bun run test"));
        assert_eq!(paths(&extraction), vec!["src/second.ts"]);
    }

    #[test]
    fn cuts_at_the_first_exit_after_the_step() {
        let log = "\
##[error]Process completed with exit code 1.
##[group]Run bun run test
src/app.ts(12,5): error TS2322: inside
##[error]Process completed with exit code 2.
src/post.ts(9,9): error TS2304: after";
        assert_eq!(
            paths(&extract(log, Some("Run bun run test"))),
            vec!["src/app.ts"]
        );
        assert!(extract(log, None).signals.is_empty());
    }

    #[test]
    fn ignores_groups_that_are_not_steps() {
        let log = "##[group]Operating System\nfatal: not a step\n##[endgroup]";
        assert!(!extract(log, Some("Operating System")).step_found);
    }
}

mod merging_and_caps {
    use super::*;

    #[test]
    fn collapses_identical_signals_and_counts_them() {
        let signals = signals(
            "##[error]Coverage is below 80%\n##[error]Coverage is below 80%\n##[error]Other",
        );
        assert_eq!(signals.len(), 2);
        assert_eq!(signals[0].repeats, 2);
        assert_eq!(signals[1].repeats, 1);
    }

    #[test]
    fn drops_an_annotation_that_restates_another_signal() {
        let signals = signals(
            "npm ERR! code E404\nnpm ERR! 404 Not Found - GET https://registry.npmjs.org/x - Not found\n##[error]npm failed: 404 Not Found - GET https://registry.npmjs.org/x - Not found\n##[error]Deploy key expired",
        );
        let messages: Vec<&str> = signals
            .iter()
            .map(|signal| signal.message.as_str())
            .collect();
        assert_eq!(
            messages,
            vec![
                "Deploy key expired",
                "404 Not Found - GET https://registry.npmjs.org/x - Not found"
            ]
        );
    }

    #[test]
    fn keeps_at_most_max_signals_with_the_summary_first() {
        let mut lines: Vec<String> = (1..=50)
            .map(|line| format!("src/app.ts({line},1): error TS2322: Type mismatch number {line}"))
            .collect();
        lines.extend(
            [
                "1) [chromium] › tests/a.spec.ts:1:1 › a",
                "  Error: boom",
                "",
                "  1 failed",
            ]
            .map(str::to_string),
        );
        let signals = signals(&lines.join("\n"));
        assert_eq!(signals.len(), MAX_SIGNALS);
        assert_eq!(signals[0].kind, SignalKind::Summary);
        assert_eq!(signals[1].line, Some(1));
    }

    #[test]
    fn clips_lines_excerpts_and_frames() {
        let long = "x".repeat(MAX_LINE_CHARS * 2);
        let mut lines = vec![
            format!("  Failed Fsp.Tests.Long{long}"),
            format!("Assert.Equal() Failure: {long}"),
        ];
        lines.extend(
            (0..8).map(|frame| format!("at Fsp.Frames.F{frame}() in /src/F.cs:line {frame}")),
        );
        let signals = signals(&lines.join("\n"));
        let signal = &signals[0];
        assert_eq!(signal.message.chars().count(), MAX_LINE_CHARS);
        assert!(signal.message.ends_with('…'));
        assert_eq!(
            signal.test_id.as_ref().map(|id| id.chars().count()),
            Some(MAX_LINE_CHARS)
        );
        assert!(signal
            .excerpt
            .iter()
            .all(|line| line.chars().count() <= MAX_LINE_CHARS));
        assert_eq!(signal.frames.len(), MAX_FRAMES);

        let context: Vec<String> = (0..60).map(|line| format!("  context {line}")).collect();
        let playwright = format!(
            "1) [chromium] › tests/a.spec.ts:1:1 › a\n{}\n\n  1 failed",
            context.join("\n")
        );
        let excerpt = &signals_of(&playwright, "playwright")[1].excerpt;
        assert_eq!(excerpt.len(), MAX_EXCERPT_LINES);
    }

    fn signals_of(log: &str, parser: &str) -> Vec<Signal> {
        of_parser(&signals(log), parser)
            .into_iter()
            .cloned()
            .collect()
    }

    #[test]
    fn falls_back_to_generic_when_only_a_summary_was_found() {
        let signals = signals(
            "fatal: unable to access 'https://github.com/a/b/'\n[chromium] runs\n  1 failed",
        );
        assert_eq!(signals.len(), 2);
        assert_eq!(signals[0].kind, SignalKind::Summary);
        assert_eq!(signals[1].kind, SignalKind::Generic);
        assert!(signals[1].message.starts_with("fatal: unable to access"));
    }
}

mod large_logs {
    use super::*;

    const TARGET_BYTES: usize = 2 * 1024 * 1024;

    fn noise() -> String {
        NOISE.repeat(TARGET_BYTES / NOISE.len() + 1)
    }

    /// The failure sits after 2 MB of build and test output inside the same step.
    #[test]
    fn finds_the_failure_under_two_megabytes_of_noise() {
        let marker = "$ vitest run\n";
        let at = VITEST.find(marker).expect("vitest fixture runs vitest") + marker.len();
        let log = format!("{}{}{}", &VITEST[..at], noise(), &VITEST[at..]);
        assert!(log.len() > TARGET_BYTES);

        let started = Instant::now();
        let narrowed = extract(&log, Some("Run bun run test"));
        let whole = extract(&log, None);
        assert!(
            started.elapsed() < Duration::from_secs(30),
            "took {:?}",
            started.elapsed()
        );

        for extraction in [narrowed, whole] {
            let found: Vec<(&str, Option<&str>)> = extraction
                .signals
                .iter()
                .map(|signal| (signal.parser.as_str(), signal.test_id.as_deref()))
                .collect();
            assert_eq!(
                found,
                vec![
                    (
                        "vitest",
                        Some("src/services/__tests__/cart.test.ts > cart > applies the discount")
                    ),
                    (
                        "vitest",
                        Some("src/components/__tests__/CartSummary.test.tsx > CartSummary > renders the total")
                    ),
                    (
                        "vitest",
                        Some("src/components/__tests__/CartSummary.test.tsx > CartSummary > renders the savings")
                    ),
                ]
            );
        }
    }

    #[test]
    fn caps_generic_lines_in_two_megabytes_of_noise() {
        let signals = signals(&noise());
        assert_eq!(signals.len(), MAX_SIGNALS);
        assert!(signals
            .iter()
            .all(|signal| signal.kind == SignalKind::Generic));
    }
}
