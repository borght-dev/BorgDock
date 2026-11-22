import Foundation

// Best-effort removal of credentials and personal paths from CI text, run before anything is kept or shown. The port
// of the server's `ci/sanitize.ts`, itself the desktop's src-tauri/src/ci_failures/sanitize.rs.

enum CiSanitizer {
    /// `text` with tokens, credentials and home directories replaced by markers. GitHub's own `***` masking stays,
    /// and so does the runner's home (`/home/runner`, and `/Users/runner` on macOS runners): normalizing turns it
    /// into a repository-relative path.
    static func scrub(_ text: String) -> String {
        var result = text
        result.replace(#/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/#.asInJavaScript, with: "[REDACTED:private-key]")
        result.replace(#/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/#.asInJavaScript, with: "[REDACTED:github-token]")
        result.replace(#/\bxox[abprs]-[A-Za-z0-9-]{10,}/#.asInJavaScript, with: "[REDACTED:slack-token]")
        result.replace(#/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/#.asInJavaScript, with: "[REDACTED:jwt]")
        result.replace(#/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/#.asInJavaScript, with: "[REDACTED:aws-key]")
        result.replace(#/\b((?:proxy-)?authorization)(\s*[:=]\s*)(?:(?:bearer|basic|token)\s+)?[^\s,;]+/#.ignoresCase().asInJavaScript) { "\($0.1)\($0.2)[REDACTED]" }
        result.replace(#/\b((?:set-)?cookie)(\s*:\s*)[^\r\n]+/#.ignoresCase().asInJavaScript) { "\($0.1)\($0.2)[REDACTED]" }
        result.replace(#/\b(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/#.ignoresCase().asInJavaScript) { "\($0.1)[REDACTED]" }
        result.replace(
            #/([?&](?:access_token|token|sig|signature|code|password|secret|api_key|apikey|x-amz-signature|x-amz-credential|x-amz-security-token)=)[^&\s'<>]+/#
                .ignoresCase().asInJavaScript
        ) { "\($0.1)[REDACTED]" }
        result.replace(#/\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/#.ignoresCase().asInJavaScript) { "\($0.1)[REDACTED]@" }
        result.replace(#/\b(AccountKey|SharedAccessKey|SharedAccessSignature|Password|Pwd)=[^;\s]+/#.ignoresCase().asInJavaScript) { "\($0.1)=[REDACTED]" }
        result.replace(#/\b(aws_secret_access_key|_authToken)(\s*[=:]\s*)\S+/#.ignoresCase().asInJavaScript) { "\($0.1)\($0.2)[REDACTED]" }
        result.replace(#/("?(?:password|passwd|client_secret|api[_-]?key)"?\s*[:=]\s*"?)[^"\s,;]{4,}/#.ignoresCase().asInJavaScript) { "\($0.1)[REDACTED]" }
        result.replace(#/\b([A-Z]:\\Users\\)[^\\\s]+/#.ignoresCase().asInJavaScript) { "\($0.1)<user>" }
        result.replace(#/\/(home|Users)\/([^/\s]+)/#.asInJavaScript) { $0.2 == "runner" ? String($0.0) : "/\($0.1)/<user>" }
        return result
    }
}
