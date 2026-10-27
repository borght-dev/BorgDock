use std::sync::LazyLock;

use regex::Regex;

use super::{excerpt, number, pattern};
use crate::ci_failures::signal::{Signal, SignalKind, MAX_EXCERPT_LINES, MAX_FRAMES};

/// `---- module::tests::name stdout ----`: libtest's captured output of a failed test.
static STDOUT_HEADER: LazyLock<Regex> = LazyLock::new(|| pattern(r"^---- (.+) stdout ----$"));
/// `thread 'name' panicked at src/x.rs:10:5:` (Rust 1.73+, with the thread id
/// since 1.88) or `thread 'name' panicked at 'message', src/x.rs:10:5` before.
static PANIC: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r"^thread '([^']*)'(?: \(\d+\))? panicked at (?:'(.*)', )?(.+?):(\d+):(\d+):?$")
});
static SIDE: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\s*(left|right): (.*)$"));
static BACKTRACE_FRAME: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\s*\d+: (\S+)"));
static SYMBOL_HASH: LazyLock<Regex> = LazyLock::new(|| pattern(r"::h[0-9a-f]{16}$"));
static UNWRAP: LazyLock<Regex> = LazyLock::new(|| pattern(r"^called `(\w+::\w+)\(\)`"));
static RUSTC_ERROR: LazyLock<Regex> = LazyLock::new(|| pattern(r"^error(?:\[(E\d+)\])?: (.+)$"));
static LOCATION: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\s*--> (.+?):(\d+):(\d+)$"));

const RUNTIME_FRAMES: [&str; 7] = [
    "std::", "core::", "alloc::", "test::", "<", "rust_", "__rust",
];
/// Without `--nocapture` the panic sits in a stdout block; with it, on its own.
const LOOSE_PANIC_LINES: usize = 20;

pub fn parse(lines: &[&str]) -> Vec<Signal> {
    let mut signals = tests(lines);
    signals.extend(compile_errors(lines));
    signals
}

fn tests(lines: &[&str]) -> Vec<Signal> {
    let mut signals = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        if let Some(header) = STDOUT_HEADER.captures(lines[index]) {
            let end = stdout_end(lines, index + 1);
            signals.push(test_failure(&header[1], &lines[index + 1..end]));
            index = end;
        } else if let Some(name) = loose_panic(lines[index]) {
            let end = index
                + lines[index..]
                    .iter()
                    .take(LOOSE_PANIC_LINES)
                    .take_while(|line| !line.trim().is_empty())
                    .count();
            signals.push(test_failure(name, &lines[index..end]));
            index = end;
        } else {
            index += 1;
        }
    }
    signals
}

fn stdout_end(lines: &[&str], start: usize) -> usize {
    lines[start..]
        .iter()
        .position(|line| {
            STDOUT_HEADER.is_match(line)
                || line.trim() == "failures:"
                || line.starts_with("test result:")
        })
        .map_or(lines.len(), |offset| start + offset)
}

/// libtest names each test's thread after the test; `main` is a binary or a build script.
fn loose_panic(line: &str) -> Option<&str> {
    let name = PANIC.captures(line)?.get(1)?.as_str();
    (!matches!(name, "main" | "<unnamed>")).then_some(name)
}

fn test_failure(test_id: &str, block: &[&str]) -> Signal {
    let lines: Vec<&str> = block
        .iter()
        .copied()
        .filter(|line| {
            !line.trim().is_empty() && !line.starts_with("note: run with `RUST_BACKTRACE")
        })
        .collect();
    let panic = lines
        .iter()
        .enumerate()
        .find_map(|(index, line)| PANIC.captures(line).map(|captures| (index, captures)));
    let message = match &panic {
        Some((_, captures)) if captures.get(2).is_some() => Some(captures[2].to_string()),
        Some((index, _)) => lines.get(index + 1).map(|line| line.trim().to_string()),
        None => lines.first().map(|line| line.trim().to_string()),
    }
    .unwrap_or_else(|| format!("Test failed: {test_id}"));
    let (left, right) = sides(&lines);
    Signal {
        test_id: Some(test_id.to_string()),
        path: panic.as_ref().map(|(_, captures)| captures[3].to_string()),
        line: panic
            .as_ref()
            .and_then(|(_, captures)| number(&captures[4])),
        column: panic
            .as_ref()
            .and_then(|(_, captures)| number(&captures[5])),
        error_class: error_class(&message),
        expected: right,
        actual: left,
        excerpt: excerpt(&lines[..lines.len().min(MAX_EXCERPT_LINES)]),
        frames: frames(&lines),
        ..Signal::new(SignalKind::Test, "cargo-test", message)
    }
}

/// `assert_eq!` prints `left: …` and `right: …`; older toolchains wrap both in backticks.
fn sides(lines: &[&str]) -> (Option<String>, Option<String>) {
    let mut left = None;
    let mut right = None;
    for captures in lines.iter().filter_map(|line| SIDE.captures(line)) {
        let value = captures[2]
            .trim()
            .trim_end_matches(',')
            .trim_matches('`')
            .to_string();
        let slot = if &captures[1] == "left" {
            &mut left
        } else {
            &mut right
        };
        slot.get_or_insert(value);
    }
    (left, right)
}

fn error_class(message: &str) -> Option<String> {
    let class = if message.contains("left == right") {
        "assert_eq"
    } else if message.contains("left != right") {
        "assert_ne"
    } else if message.starts_with("assertion failed") {
        "assert"
    } else {
        return UNWRAP
            .captures(message)
            .map(|captures| captures[1].to_string());
    };
    Some(class.to_string())
}

/// The test's own frames from a `RUST_BACKTRACE=1` backtrace.
fn frames(lines: &[&str]) -> Vec<String> {
    lines
        .iter()
        .filter_map(|line| BACKTRACE_FRAME.captures(line))
        .map(|captures| SYMBOL_HASH.replace(&captures[1], "").into_owned())
        .filter(|symbol| {
            !RUNTIME_FRAMES
                .iter()
                .any(|prefix| symbol.starts_with(prefix))
        })
        .take(MAX_FRAMES)
        .collect()
}

/// `error[E0308]: mismatched types` with its `--> src/x.rs:10:5` on the next lines.
/// Errors without a location (`could not compile`) only sum up the others.
fn compile_errors(lines: &[&str]) -> Vec<Signal> {
    lines
        .iter()
        .enumerate()
        .filter_map(|(index, line)| {
            let error = RUSTC_ERROR.captures(line)?;
            let location = lines[index + 1..]
                .iter()
                .take(3)
                .find_map(|line| LOCATION.captures(line))?;
            let length = lines[index..]
                .iter()
                .take(MAX_EXCERPT_LINES)
                .take_while(|line| !line.trim().is_empty())
                .count();
            Some(Signal {
                path: Some(location[1].to_string()),
                line: number(&location[2]),
                column: number(&location[3]),
                code: error.get(1).map(|code| code.as_str().to_string()),
                excerpt: excerpt(&lines[index..index + length]),
                ..Signal::new(SignalKind::Compile, "rustc", error[2].trim())
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::super::extract;
    use super::*;

    const PANIC_LOG: &str = include_str!("../fixtures/logs/cargo-test-panic.log");
    const COMPILE_LOG: &str = include_str!("../fixtures/logs/rustc-compile-error.log");

    #[test]
    fn reads_cargo_test_panics_from_a_job_log() {
        let extraction = extract(PANIC_LOG, Some("Run cargo test --lib"));
        assert!(extraction.step_found);
        let signals = extraction.signals;
        assert_eq!(signals.len(), 2, "{signals:#?}");

        let equal = &signals[0];
        assert_eq!(equal.kind, SignalKind::Test);
        assert_eq!(equal.parser, "cargo-test");
        assert_eq!(
            equal.test_id.as_deref(),
            Some("ci_failures::extract::tests::caps_signals")
        );
        assert_eq!(
            equal.message,
            "assertion `left == right` failed: one summary first"
        );
        assert_eq!(equal.error_class.as_deref(), Some("assert_eq"));
        assert_eq!(equal.expected.as_deref(), Some("20"));
        assert_eq!(equal.actual.as_deref(), Some("21"));
        assert_eq!(
            equal.path.as_deref(),
            Some("src/ci_failures/extract/tests.rs")
        );
        assert_eq!(equal.line, Some(118));
        assert_eq!(equal.column, Some(9));

        let unwrap = &signals[1];
        assert_eq!(
            unwrap.test_id.as_deref(),
            Some("settings::tests::loads_defaults")
        );
        assert_eq!(unwrap.error_class.as_deref(), Some("Result::unwrap"));
        assert_eq!(
            unwrap.frames,
            vec![
                "borgdock_lib::settings::load",
                "borgdock_lib::settings::tests::loads_defaults"
            ]
        );
    }

    #[test]
    fn reads_panics_printed_with_nocapture() {
        let signals = parse(&[
            "running 1 test",
            "thread 'git::tests::parses_branch' (4242) panicked at src/git/mod.rs:88:5:",
            "assertion failed: branch.is_some()",
            "note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace",
            "test git::tests::parses_branch ... FAILED",
            "",
        ]);
        assert_eq!(signals.len(), 1);
        assert_eq!(
            signals[0].test_id.as_deref(),
            Some("git::tests::parses_branch")
        );
        assert_eq!(signals[0].error_class.as_deref(), Some("assert"));
        assert_eq!(signals[0].line, Some(88));
    }

    #[test]
    fn reads_the_old_panic_format() {
        let signals = parse(&[
            "---- tests::adds stdout ----",
            "thread 'tests::adds' panicked at 'called `Option::unwrap()` on a `None` value', src/lib.rs:10:5",
        ]);
        assert_eq!(
            signals[0].message,
            "called `Option::unwrap()` on a `None` value"
        );
        assert_eq!(signals[0].error_class.as_deref(), Some("Option::unwrap"));
        assert_eq!(signals[0].path.as_deref(), Some("src/lib.rs"));
        assert_eq!(signals[0].line, Some(10));
    }

    #[test]
    fn ignores_the_main_thread() {
        assert!(parse(&["thread 'main' panicked at build.rs:3:5:", "no protoc"]).is_empty());
    }

    #[test]
    fn reads_rustc_errors_from_a_job_log() {
        let signals = extract(COMPILE_LOG, Some("Run cargo clippy --lib -- -D warnings")).signals;
        assert_eq!(signals.len(), 2, "{signals:#?}");
        assert_eq!(signals[0].kind, SignalKind::Compile);
        assert_eq!(signals[0].parser, "rustc");
        assert_eq!(signals[0].code.as_deref(), Some("E0308"));
        assert_eq!(signals[0].message, "mismatched types");
        assert_eq!(
            signals[0].path.as_deref(),
            Some("src/ci_failures/extract/mod.rs")
        );
        assert_eq!(signals[0].line, Some(61));
        assert_eq!(signals[0].column, Some(5));
        assert!(signals[0]
            .excerpt
            .iter()
            .any(|line| line.contains("expected `u32`, found `&str`")));
        assert_eq!(signals[1].code.as_deref(), Some("E0425"));
        assert_eq!(
            signals[1].message,
            "cannot find value `lines` in this scope"
        );
    }
}
