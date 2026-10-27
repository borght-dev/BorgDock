use std::sync::LazyLock;

use regex::Regex;

use super::{number, pattern};
use crate::ci_failures::signal::{Signal, SignalKind};

/// `#12 ERROR: process "/bin/sh -c bun install" did not complete successfully: exit code: 1`
static STEP_ERROR: LazyLock<Regex> = LazyLock::new(|| pattern(r"^#\d+ ERROR: (.+)$"));
/// buildx's last line; newer versions prefix `failed to build: `.
static SOLVE_ERROR: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^ERROR: (?:failed to build: )?failed to solve: (.+)$"));
/// `The command '/bin/sh -c npm ci' returned a non-zero code: 1`, the classic builder.
static CLASSIC: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^The command '.+' returned a non-zero code: \d+$"));
/// `Dockerfile:8`, above the snippet of the failed instruction.
static DOCKERFILE_LINE: LazyLock<Regex> = LazyLock::new(|| pattern(r"^(\S*Dockerfile\S*):(\d+)$"));

/// How far above the final error buildx prints the failed step's output and snippet.
const REPORT_LINES: usize = 60;
const RULE: &str = "------";

/// One signal per failed build. A step's `#N ERROR` is kept only when no
/// final `failed to solve` line repeats it (a cut-off log).
pub fn parse(lines: &[&str]) -> Vec<Signal> {
    let mut signals = Vec::new();
    let mut steps: Vec<(usize, &str)> = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        if let Some(captures) = STEP_ERROR.captures(line) {
            steps.push((
                index,
                captures.get(1).map_or("", |message| message.as_str()),
            ));
        } else if let Some(captures) = SOLVE_ERROR.captures(line) {
            let message = captures[1].trim();
            steps.retain(|(_, step)| !message.contains(step.trim()));
            signals.push(failure(lines, index, message));
        } else if CLASSIC.is_match(line) {
            signals.push(failure(lines, index, line.trim()));
        }
    }
    signals.extend(
        steps
            .into_iter()
            .map(|(index, message)| failure(lines, index, message.trim())),
    );
    signals
}

fn failure(lines: &[&str], index: usize, message: &str) -> Signal {
    let report = &lines[index.saturating_sub(REPORT_LINES)..index];
    let location = report
        .iter()
        .rev()
        .find_map(|line| DOCKERFILE_LINE.captures(line));
    let output = step_output(report);
    Signal {
        path: location.as_ref().map(|captures| captures[1].to_string()),
        line: location.as_ref().and_then(|captures| number(&captures[2])),
        excerpt: if output.is_empty() {
            vec![lines[index].trim().to_string()]
        } else {
            output
        },
        ..Signal::new(SignalKind::Tooling, "docker", message)
    }
}

/// The failed step's output between buildx's `------` rules: ` > [build 4/6] RUN …:` and what it printed.
fn step_output(report: &[&str]) -> Vec<String> {
    let Some(start) = report
        .iter()
        .rposition(|line| line.trim_start().starts_with("> ["))
    else {
        return Vec::new();
    };
    report[start..]
        .iter()
        .map(|line| line.trim())
        .take_while(|line| *line != RULE)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::super::extract;
    use super::*;

    const BUILD: &str = include_str!("../fixtures/logs/docker-build-failure.log");

    #[test]
    fn reads_a_failed_build_from_a_job_log() {
        let extraction = extract(BUILD, Some("Run docker/build-push-action@v6"));
        assert!(extraction.step_found);
        let signals = extraction.signals;
        assert_eq!(
            signals.len(),
            1,
            "the buildx annotation and step error repeat it: {signals:#?}"
        );
        let build = &signals[0];
        assert_eq!(build.kind, SignalKind::Tooling);
        assert_eq!(build.parser, "docker");
        assert_eq!(
            build.message,
            "process \"/bin/sh -c bun install --frozen-lockfile\" did not complete successfully: exit code: 1"
        );
        assert_eq!(build.path.as_deref(), Some("Dockerfile"));
        assert_eq!(build.line, Some(9));
        assert_eq!(
            build.excerpt,
            vec![
                "> [build 4/7] RUN bun install --frozen-lockfile:",
                "0.041 bun install v1.1.38 (bf2f153f)",
                "0.212 error: lockfile had changes, but lockfile is frozen",
                "0.212 note: try re-running without --frozen-lockfile and commit the updated lockfile",
            ]
        );
    }

    #[test]
    fn keeps_a_step_error_without_a_final_line() {
        let signals = parse(&[
            "#7 [build 2/7] RUN apt-get update",
            "#7 ERROR: process \"/bin/sh -c apt-get update\" did not complete successfully: exit code: 100",
        ]);
        assert_eq!(signals.len(), 1);
        assert!(signals[0].message.ends_with("exit code: 100"));
    }

    #[test]
    fn reads_the_classic_builder() {
        let signals = parse(&["The command '/bin/sh -c npm ci' returned a non-zero code: 1"]);
        assert_eq!(signals.len(), 1);
        assert_eq!(
            signals[0].message,
            "The command '/bin/sh -c npm ci' returned a non-zero code: 1"
        );
    }
}
