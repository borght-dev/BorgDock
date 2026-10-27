use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;

use super::{number, pattern, without_annotation};
use crate::ci_failures::signal::{Signal, SignalKind};

/// `path(line,col): error CODE: message`, the compiler's format.
static LOCATED: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^(.+?)\((\d+),(\d+)\):\s*error\s+([A-Z]+\d+):\s*(.+)$"));
/// `App.csproj : error NU1101: message`: restore, SDK and tool errors have no position.
static UNLOCATED: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^(\S.*?)\s+:\s+error\s+([A-Z]+\d+):\s*(.+)$"));
/// The ` [/path/App.csproj::TargetFramework=net8.0]` MSBuild appends to every
/// error, once per target framework (restore errors name the solution).
static PROJECT_SUFFIX: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"\s+\[[^\]]*\.(?:[a-z]*proj|slnx?)(?:::[^\]]*)?\]$"));

/// What the TypeScript parser deduplicated by: path, line and code.
type Key = (Option<String>, Option<u32>, Option<String>);

/// MSBuild prints every error again in its summary; repeats count them.
pub fn parse(lines: &[&str]) -> Vec<Signal> {
    let mut signals: Vec<Signal> = Vec::new();
    let mut seen: HashMap<Key, usize> = HashMap::new();
    for line in lines.iter().filter(|line| line.contains("error")) {
        let Some(signal) = located(line).or_else(|| unlocated(line)) else {
            continue;
        };
        match seen.entry((signal.path.clone(), signal.line, signal.code.clone())) {
            Entry::Occupied(index) => signals[*index.get()].repeats += 1,
            Entry::Vacant(slot) => {
                slot.insert(signals.len());
                signals.push(signal);
            }
        }
    }
    signals
}

fn located(line: &str) -> Option<Signal> {
    let captures = LOCATED.captures(line)?;
    let code = &captures[4];
    if is_typescript(code) {
        return None;
    }
    Some(Signal {
        path: Some(without_annotation(&captures[1]).to_string()),
        line: number(&captures[2]),
        column: number(&captures[3]),
        code: Some(code.to_string()),
        ..Signal::new(SignalKind::Compile, "msbuild", message(&captures[5]))
    })
}

fn unlocated(line: &str) -> Option<Signal> {
    let captures = UNLOCATED.captures(line)?;
    let code = &captures[2];
    if is_typescript(code) {
        return None;
    }
    Some(Signal {
        path: Some(without_annotation(&captures[1]).to_string()),
        code: Some(code.to_string()),
        ..Signal::new(SignalKind::Compile, "msbuild", message(&captures[3]))
    })
}

/// tsc uses the same line format; its parser reports those.
fn is_typescript(code: &str) -> bool {
    code.starts_with("TS") && code.len() >= 5
}

fn message(text: &str) -> String {
    PROJECT_SUFFIX.replace(text.trim(), "").into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_the_project_suffix_and_keeps_the_runner_path() {
        let signals = parse(&[
            "/home/runner/work/fsp/fsp/src/Api/Orders.cs(42,10): error CS1002: ; expected [/home/runner/work/fsp/fsp/src/Api/Api.csproj::TargetFramework=net8.0]",
        ]);
        assert_eq!(signals.len(), 1);
        assert_eq!(
            signals[0].path.as_deref(),
            Some("/home/runner/work/fsp/fsp/src/Api/Orders.cs")
        );
        assert_eq!(signals[0].message, "; expected");
    }

    #[test]
    fn counts_the_summary_repeat_of_an_error() {
        let line = "src/Foo.cs(42,10): error CS1002: ; expected [src/App.csproj]";
        let signals = parse(&[line, "Build FAILED.", line]);
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].repeats, 2);
    }

    #[test]
    fn reads_restore_errors_without_a_position() {
        let signals = parse(&[
            "/home/runner/work/fsp/fsp/src/Api/Api.csproj : error NU1101: Unable to find package Acme.Widgets. No packages exist with this id in source(s): nuget.org [/home/runner/work/fsp/fsp/Fsp.sln]",
        ]);
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].code.as_deref(), Some("NU1101"));
        assert_eq!(signals[0].line, None);
        assert_eq!(
            signals[0].message,
            "Unable to find package Acme.Widgets. No packages exist with this id in source(s): nuget.org"
        );
    }

    #[test]
    fn leaves_typescript_codes_and_warnings_alone() {
        assert!(parse(&[
            "src/app.ts(1,1): error TS2322: Type mismatch",
            "src/Foo.cs(3,3): warning CS0168: The variable 'e' is declared but never used",
        ])
        .is_empty());
    }
}
