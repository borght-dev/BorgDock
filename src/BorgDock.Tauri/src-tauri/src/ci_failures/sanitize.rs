//! Best-effort removal of credentials and personal paths from CI text, run
//! before anything is stored, rendered, copied or put in a prompt.

use regex::{Captures, Regex};
use std::sync::LazyLock;

struct Rule {
    pattern: Regex,
    replacement: &'static str,
}

fn rule(pattern: &str, replacement: &'static str) -> Rule {
    Rule {
        pattern: Regex::new(pattern).expect("sanitizer pattern"),
        replacement,
    }
}

static RULES: LazyLock<Vec<Rule>> = LazyLock::new(|| {
    vec![
        rule(
            r"(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
            "[REDACTED:private-key]",
        ),
        rule(
            r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b",
            "[REDACTED:github-token]",
        ),
        rule(r"\bxox[abprs]-[A-Za-z0-9-]{10,}", "[REDACTED:slack-token]"),
        rule(
            r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}",
            "[REDACTED:jwt]",
        ),
        rule(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b", "[REDACTED:aws-key]"),
        rule(
            r"(?i)\b((?:proxy-)?authorization)(\s*[:=]\s*)(?:(?:bearer|basic|token)\s+)?[^\s,;]+",
            "$1$2[REDACTED]",
        ),
        rule(
            r"(?i)\b((?:set-)?cookie)(\s*:\s*)[^\r\n]+",
            "$1$2[REDACTED]",
        ),
        rule(r"(?i)\b(bearer\s+)[A-Za-z0-9._~+/=-]{8,}", "$1[REDACTED]"),
        rule(
            r"(?i)([?&](?:access_token|token|sig|signature|code|password|secret|api_key|apikey|x-amz-signature|x-amz-credential|x-amz-security-token)=)[^&\s'<>]+",
            "$1[REDACTED]",
        ),
        rule(
            r"(?i)\b([a-z][a-z0-9+.-]*://)[^/\s:@]+:[^/\s@]+@",
            "$1[REDACTED]@",
        ),
        rule(
            r"(?i)\b(AccountKey|SharedAccessKey|SharedAccessSignature|Password|Pwd)=[^;\s]+",
            "$1=[REDACTED]",
        ),
        rule(
            r"(?i)\b(aws_secret_access_key|_authToken)(\s*[=:]\s*)\S+",
            "$1$2[REDACTED]",
        ),
        rule(
            r#"(?i)("?(?:password|passwd|client_secret|api[_-]?key)"?\s*[:=]\s*"?)[^"\s,;]{4,}"#,
            "$1[REDACTED]",
        ),
        rule(r"(?i)\b([A-Z]:\\Users\\)[^\\\s]+", "$1<user>"),
        rule(r"(/Users/)[^/\s]+", "$1<user>"),
    ]
});

static HOME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"/home/([^/\s]+)").unwrap());

/// `text` with tokens, credentials and user home directories replaced by
/// markers. GitHub's own `***` masking is left as it is. The runner's own home
/// (`/home/runner`) stays, because fingerprinting turns it into a
/// repository-relative path.
pub fn scrub(text: &str) -> String {
    let mut result = text.to_string();
    for rule in RULES.iter() {
        if rule.pattern.is_match(&result) {
            result = rule
                .pattern
                .replace_all(&result, rule.replacement)
                .into_owned();
        }
    }
    HOME.replace_all(&result, |caps: &Captures| {
        if &caps[1] == "runner" {
            caps[0].to_string()
        } else {
            "/home/<user>".to_string()
        }
    })
    .into_owned()
}

#[cfg(test)]
mod tests {
    use super::scrub;

    #[test]
    fn redacts_credentials() {
        let cases = [
            (
                "token ghp_abcdefghijklmnopqrstuvwxyz0123456789 used",
                "token [REDACTED:github-token] used",
            ),
            (
                "github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz",
                "[REDACTED:github-token]",
            ),
            (
                "Authorization: Bearer abc.def.ghi-123",
                "Authorization: [REDACTED]",
            ),
            ("authorization=token abcdef123456", "authorization=[REDACTED]"),
            ("Cookie: session=abc; other=def", "Cookie: [REDACTED]"),
            (
                "curl -H 'x' https://x.blob.core.windows.net/a?sv=2021&sig=AbC%2Fdef&se=2026",
                "curl -H 'x' https://x.blob.core.windows.net/a?sv=2021&sig=[REDACTED]&se=2026",
            ),
            (
                "git clone https://user:s3cret@github.com/a/b",
                "git clone https://[REDACTED]@github.com/a/b",
            ),
            (
                "DefaultEndpointsProtocol=https;AccountName=x;AccountKey=abc123==;EndpointSuffix=core",
                "DefaultEndpointsProtocol=https;AccountName=x;AccountKey=[REDACTED];EndpointSuffix=core",
            ),
            ("key AKIAABCDEFGHIJKLMNOP", "key [REDACTED:aws-key]"),
            (
                "//registry.npmjs.org/:_authToken=npm_abcdef",
                "//registry.npmjs.org/:_authToken=[REDACTED]",
            ),
            (r#"{"password": "hunter22"}"#, r#"{"password": "[REDACTED]"}"#),
            (
                "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
                "jwt [REDACTED:jwt]",
            ),
            (
                "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----",
                "[REDACTED:private-key]",
            ),
        ];
        for (input, expected) in cases {
            assert_eq!(scrub(input), expected, "input: {input}");
        }
    }

    #[test]
    fn replaces_personal_home_directories() {
        assert_eq!(
            scrub(r"C:\Users\koen\src\app.ts"),
            r"C:\Users\<user>\src\app.ts"
        );
        assert_eq!(scrub("/Users/koen/dev/a.ts"), "/Users/<user>/dev/a.ts");
        assert_eq!(scrub("/home/koen/a.ts"), "/home/<user>/a.ts");
        assert_eq!(
            scrub("/home/runner/work/app/app/src/a.ts"),
            "/home/runner/work/app/app/src/a.ts"
        );
    }

    #[test]
    fn leaves_ordinary_failures_alone() {
        let text = [
            "src/app.ts(12,5): error TS2322: Type string is not assignable to type number.",
            "Expected: 200 Received: 503",
            "connect ECONNREFUSED 127.0.0.1:5432",
            "password field is required",
            "Run actions/checkout@v4 with token: ***",
        ]
        .join("\n");
        assert_eq!(scrub(&text), text);
    }
}
