// Best-effort removal of credentials and personal paths from CI text, run before anything is stored or sent.
// Ported from the desktop's src-tauri/src/ci_failures/sanitize.rs.

const RULES: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED:private-key]'],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[REDACTED:github-token]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[REDACTED:slack-token]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[REDACTED:jwt]'],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED:aws-key]'],
  [/\b((?:proxy-)?authorization)(\s*[:=]\s*)(?:(?:bearer|basic|token)\s+)?[^\s,;]+/gi, '$1$2[REDACTED]'],
  [/\b((?:set-)?cookie)(\s*:\s*)[^\r\n]+/gi, '$1$2[REDACTED]'],
  [/\b(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[REDACTED]'],
  [/([?&](?:access_token|token|sig|signature|code|password|secret|api_key|apikey|x-amz-signature|x-amz-credential|x-amz-security-token)=)[^&\s'<>]+/gi, '$1[REDACTED]'],
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1[REDACTED]@'],
  [/\b(AccountKey|SharedAccessKey|SharedAccessSignature|Password|Pwd)=[^;\s]+/gi, '$1=[REDACTED]'],
  [/\b(aws_secret_access_key|_authToken)(\s*[=:]\s*)\S+/gi, '$1$2[REDACTED]'],
  [/("?(?:password|passwd|client_secret|api[_-]?key)"?\s*[:=]\s*"?)[^"\s,;]{4,}/gi, '$1[REDACTED]'],
  [/\b([A-Z]:\\Users\\)[^\\\s]+/gi, '$1<user>'],
];

/**
 * `text` with tokens, credentials and home directories replaced by markers. GitHub's own `***` masking stays, and
 * so does the runner's home (`/home/runner`, and `/Users/runner` on macOS runners, which the desktop scrubs too):
 * normalizing turns it into a repository-relative path.
 */
export function scrub(text: string): string {
  let result = text;
  for (const [pattern, replacement] of RULES) result = result.replace(pattern, replacement);
  return result.replace(/\/(home|Users)\/([^/\s]+)/g, (whole, root: string, user: string) => (user === 'runner' ? whole : `/${root}/<user>`));
}
