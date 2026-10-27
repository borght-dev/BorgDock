//! Failure signals from a GitHub Actions job log.
//!
//! The first five parsers are the webview's former `log-parser.ts`, with its
//! matches and order. The rest cover the other tools the configured repos run.

mod annotations;
mod cargo;
mod docker;
mod dotnet_test;
mod generic;
mod msbuild;
mod npm;
mod playwright;
mod typescript;
mod vitest;

#[cfg(test)]
mod tests;

use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::ops::Range;
use std::sync::LazyLock;

use regex::Regex;

use crate::ci_failures::signal::{
    clip, Signal, SignalKind, MAX_EXCERPT_LINES, MAX_FRAMES, MAX_LINE_CHARS, MAX_SIGNALS,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Extraction {
    pub signals: Vec<Signal>,
    /// True when `failed_step` was found as a `##[group]Run …` header and extraction was narrowed to that step.
    pub step_found: bool,
}

type Parser = fn(&[&str]) -> Vec<Signal>;

/// Report order. Generic lines are read only when none of these found anything.
const PARSERS: [Parser; 9] = [
    msbuild::parse,
    dotnet_test::parse,
    typescript::parse,
    playwright::parse,
    annotations::parse,
    vitest::parse,
    cargo::parse,
    npm::parse,
    docker::parse,
];

/// An annotation is dropped as a restatement only when the other signal's
/// message is at least this long, so a short message can't swallow it.
const MIN_RESTATED_CHARS: usize = 12;

static TIMESTAMP: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\d{4}-\d{2}-\d{2}T[\d:.]+Z ?"));
static ANSI: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))"));

/// `log` is already sanitized by the caller. `failed_step` is the GitHub job step name that failed (e.g. "Run bun run test" or a custom name), if known.
pub fn extract(log: &str, failed_step: Option<&str>) -> Extraction {
    let text = preprocess(log);
    let lines: Vec<&str> = text.lines().collect();
    let section = narrow(&lines, failed_step);
    let lines = &lines[section.range.clone()];
    let mut signals: Vec<Signal> = PARSERS.iter().flat_map(|parse| parse(lines)).collect();
    if signals
        .iter()
        .all(|signal| signal.kind == SignalKind::Summary)
    {
        signals.extend(generic::parse(lines, section.range.start));
    }
    Extraction {
        signals: finish(signals),
        step_found: section.step_found,
    }
}

/// Strips the runner's per-line timestamps and terminal escapes. Indentation
/// after the timestamp stays: excerpts and diff blocks depend on it.
pub fn preprocess(log: &str) -> String {
    let mut text = String::with_capacity(log.len());
    for (index, line) in log.lines().enumerate() {
        if index > 0 {
            text.push('\n');
        }
        let line = TIMESTAMP
            .find(line)
            .map_or(line, |stamp| &line[stamp.end()..]);
        text.push_str(&ANSI.replace_all(line, ""));
    }
    text
}

struct Section {
    range: Range<usize>,
    step_found: bool,
}

/// The failed step's output, without the post-job cleanup after it. Earlier
/// steps print warnings and errors that didn't fail the job.
fn narrow(lines: &[&str], failed_step: Option<&str>) -> Section {
    let header = failed_step.and_then(|step| step_header(lines, step.trim()));
    let start = header.unwrap_or(0);
    let end = lines[start..]
        .iter()
        .position(|line| is_exit_code(line))
        .map_or(lines.len(), |offset| start + offset + 1);
    Section {
        range: start..end,
        step_found: header.is_some(),
    }
}

fn step_header(lines: &[&str], step: &str) -> Option<usize> {
    lines.iter().rposition(|line| {
        line.trim()
            .strip_prefix("##[group]")
            .filter(|header| header.starts_with("Run "))
            .is_some_and(|header| header == step || header.strip_prefix("Run ") == Some(step))
    })
}

fn is_exit_code(line: &str) -> bool {
    line.trim_start()
        .strip_prefix("##[error]")
        .is_some_and(|message| message.starts_with(annotations::EXIT_CODE))
}

fn finish(signals: Vec<Signal>) -> Vec<Signal> {
    let (mut ordered, failures): (Vec<Signal>, Vec<Signal>) =
        collapse(drop_restated_annotations(signals))
            .into_iter()
            .partition(|signal| signal.kind == SignalKind::Summary);
    ordered.extend(failures);
    ordered.truncate(MAX_SIGNALS);
    ordered.iter_mut().for_each(cap);
    ordered
}

/// `##[error]` lines often repeat what a tool printed (buildx, test loggers),
/// and the tool's signal has the structure.
fn drop_restated_annotations(signals: Vec<Signal>) -> Vec<Signal> {
    let stated: Vec<String> = signals
        .iter()
        .filter(|signal| !matches!(signal.kind, SignalKind::Annotation | SignalKind::Summary))
        .filter(|signal| signal.message.chars().count() >= MIN_RESTATED_CHARS)
        .map(|signal| signal.message.clone())
        .collect();
    signals
        .into_iter()
        .filter(|signal| {
            signal.kind != SignalKind::Annotation
                || !stated
                    .iter()
                    .any(|message| signal.message.contains(message.as_str()))
        })
        .collect()
}

type Identity = (
    u8,
    String,
    Option<String>,
    Option<String>,
    Option<u32>,
    Option<String>,
    String,
);

/// Retries and repeated compiler lines become one signal that counts them.
fn collapse(signals: Vec<Signal>) -> Vec<Signal> {
    let mut kept: Vec<Signal> = Vec::with_capacity(signals.len());
    let mut seen: HashMap<Identity, usize> = HashMap::new();
    for signal in signals {
        match seen.entry(identity(&signal)) {
            Entry::Occupied(index) => {
                let first = &mut kept[*index.get()];
                first.repeats = first.repeats.saturating_add(signal.repeats);
            }
            Entry::Vacant(slot) => {
                slot.insert(kept.len());
                kept.push(signal);
            }
        }
    }
    kept
}

fn identity(signal: &Signal) -> Identity {
    (
        signal.kind as u8,
        signal.parser.clone(),
        signal.test_id.clone(),
        signal.path.clone(),
        signal.line,
        signal.code.clone(),
        signal.message.clone(),
    )
}

fn cap(signal: &mut Signal) {
    signal.excerpt.truncate(MAX_EXCERPT_LINES);
    signal.frames.truncate(MAX_FRAMES);
    signal.map_text(&|text| clip(text, MAX_LINE_CHARS));
}

fn pattern(source: &str) -> Regex {
    Regex::new(source).expect("extraction pattern")
}

fn number(digits: &str) -> Option<u32> {
    digits.parse().ok()
}

/// MSBuild and tsc lines turned into annotations keep their location.
fn without_annotation(text: &str) -> &str {
    text.strip_prefix("##[error]").unwrap_or(text).trim()
}

/// The non-blank lines with their common indentation removed, so code frames
/// and diffs keep their shape.
fn excerpt(lines: &[&str]) -> Vec<String> {
    let indent = |line: &str| line.len() - line.trim_start_matches([' ', '\t']).len();
    let lines: Vec<&str> = lines
        .iter()
        .copied()
        .filter(|line| !line.trim().is_empty())
        .collect();
    let common = lines.iter().map(|line| indent(line)).min().unwrap_or(0);
    lines
        .iter()
        .map(|line| line[common.min(indent(line))..].trim_end().to_string())
        .collect()
}

static EXPECTED_RECEIVED: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^(Expected|Received)(?: [a-z]+)?:\s+(.+)$"));

/// The first `Expected: …` and `Received: …` values, as Playwright and Jest-style
/// matchers print them (`Expected string: "a"` too).
fn expected_received(lines: &[&str]) -> (Option<String>, Option<String>) {
    let mut expected = None;
    let mut received = None;
    for captures in lines
        .iter()
        .filter_map(|line| EXPECTED_RECEIVED.captures(line.trim()))
    {
        let slot = if &captures[1] == "Expected" {
            &mut expected
        } else {
            &mut received
        };
        slot.get_or_insert_with(|| captures[2].trim().to_string());
    }
    (expected, received)
}
