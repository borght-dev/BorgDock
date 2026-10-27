use serde::{Deserialize, Serialize};

/// What a failure signal describes. Fingerprinting picks its fields by kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "kebab-case")]
pub enum SignalKind {
    /// A named test that failed (dotnet test, Playwright, Vitest, cargo test).
    Test,
    /// A compiler error with a code and a location (MSBuild, TypeScript).
    Compile,
    /// A lint rule violation.
    Lint,
    /// A `##[error]` line or a check-run annotation.
    Annotation,
    /// The output of a check another app reports (title, summary, text).
    CheckOutput,
    /// A package manager or container build failure.
    Tooling,
    /// A line that only says something failed.
    Generic,
    /// A test runner's totals ("3 failed, 40 passed"). Never fingerprinted.
    Summary,
}

/// One failure found in a job's evidence, sanitized but not normalized:
/// fingerprinting normalizes in TypeScript, so a new fingerprint version can
/// re-run over stored signals without the log.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct Signal {
    pub kind: SignalKind,
    /// The parser that found it: `msbuild`, `dotnet-test`, `typescript`,
    /// `eslint`, `playwright`, `vitest`, `cargo-test`, `npm`, `docker`,
    /// `actions-annotation`, `check-annotation`, `check-output`, `generic`.
    pub parser: String,
    /// A test's identity without its parameters.
    pub test_id: Option<String>,
    /// A parameterized test's arguments, as written.
    pub params: Option<String>,
    pub path: Option<String>,
    pub line: Option<u32>,
    pub column: Option<u32>,
    /// A compiler code (`CS1002`, `TS2322`), lint rule or tool error code.
    pub code: Option<String>,
    /// An exception or assertion type (`AssertionError`, `Xunit.Sdk.EqualException`).
    pub error_class: Option<String>,
    pub expected: Option<String>,
    pub actual: Option<String>,
    /// The first line that says what went wrong.
    pub message: String,
    /// The lines around it, at most `MAX_EXCERPT_LINES`.
    pub excerpt: Vec<String>,
    /// Application stack frames, top first, at most `MAX_FRAMES`.
    pub frames: Vec<String>,
    /// How often the same failure repeated in this job (retries).
    pub repeats: u32,
}

pub const MAX_SIGNALS: usize = 20;
pub const MAX_EXCERPT_LINES: usize = 30;
pub const MAX_LINE_CHARS: usize = 240;
pub const MAX_FRAMES: usize = 5;

impl Signal {
    pub fn new(kind: SignalKind, parser: &str, message: impl Into<String>) -> Self {
        Self {
            kind,
            parser: parser.to_string(),
            test_id: None,
            params: None,
            path: None,
            line: None,
            column: None,
            code: None,
            error_class: None,
            expected: None,
            actual: None,
            message: message.into(),
            excerpt: Vec::new(),
            frames: Vec::new(),
            repeats: 1,
        }
    }

    /// Apply `f` to every text field: used by the sanitizer and the length caps.
    pub fn map_text(&mut self, f: &dyn Fn(&str) -> String) {
        let map_opt = |value: &mut Option<String>| {
            if let Some(text) = value.as_mut() {
                *text = f(text);
            }
        };
        map_opt(&mut self.test_id);
        map_opt(&mut self.params);
        map_opt(&mut self.path);
        map_opt(&mut self.code);
        map_opt(&mut self.error_class);
        map_opt(&mut self.expected);
        map_opt(&mut self.actual);
        self.message = f(&self.message);
        for line in self.excerpt.iter_mut().chain(self.frames.iter_mut()) {
            *line = f(line);
        }
    }
}

/// Cut `text` to `max` characters, ending with an ellipsis when cut.
pub fn clip(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let mut clipped: String = text.chars().take(max.saturating_sub(1)).collect();
    clipped.push('…');
    clipped
}
