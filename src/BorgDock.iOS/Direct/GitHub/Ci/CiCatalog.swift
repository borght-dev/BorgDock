import Foundation

// The port of the server's `ci/catalog.ts`, itself the desktop's src/services/ci-failures/catalog.ts.

/// Known infrastructure failures. A hit replaces the volatile text in a fingerprint with the entry's id, so the same
/// runner or registry fault groups across pull requests. The failed step stays part of the fingerprint: a DNS failure
/// while installing and one during e2e are different groups.
enum CiCatalog {
    struct Entry {
        let id: String
        /// The fault in words; a group it starts is named after it.
        let label: String
        let patterns: [Regex<Substring>]
    }

    /// Part of the fingerprint version: raise it whenever an entry changes what it matches.
    static let version = 1

    /// The entry `text` matches, if any.
    static func match(_ text: String) -> Entry? {
        entries.first { entry in entry.patterns.contains { text.contains($0) } }
    }

    private nonisolated(unsafe) static let entries = [
        entry("runner-lost", "the runner stopped or lost contact", [
            #/The runner has received a shutdown signal/#.ignoresCase(),
            #/lost communication with the server/#.ignoresCase(),
            #/The self-hosted runner .* lost/#.ignoresCase(),
        ]),
        entry("not-acquired", "the job never got a runner", [
            #/The job was not acquired by Runner/#.ignoresCase(),
            #/waiting for a runner to pick up this job/#.ignoresCase(),
        ]),
        entry("disk-full", "the runner ran out of disk space", [
            #/No space left on device/#.ignoresCase(),
            #/\bENOSPC\b/#,
            #/System\.IO\.IOException: There is not enough space/#.ignoresCase(),
        ]),
        entry("dns", "a host name could not be resolved", [
            #/Could not resolve host/#.ignoresCase(),
            #/getaddrinfo (?:ENOTFOUND|EAI_AGAIN)/#.ignoresCase(),
            #/\bEAI_AGAIN\b/#,
            #/Name or service not known/#.ignoresCase(),
            #/No such host is known/#.ignoresCase(),
            #/Temporary failure in name resolution/#.ignoresCase(),
        ]),
        entry("network-reset", "a network connection broke off", [
            #/\bECONNRESET\b/#,
            #/\bETIMEDOUT\b/#,
            #/TLS handshake timeout/#.ignoresCase(),
            #/Connection reset by peer/#.ignoresCase(),
            #/socket hang up/#.ignoresCase(),
            #/The SSL connection could not be established/#.ignoresCase(),
        ]),
        entry("registry-limit", "a package registry rate-limited the runner", [
            #/toomanyrequests/#.ignoresCase(),
            #/429 Too Many Requests/#.ignoresCase(),
            #/You have reached your pull rate limit/#.ignoresCase(),
            #/rate limit exceeded/#.ignoresCase(),
        ]),
        entry("registry-5xx", "a package registry had a server error", [
            #/npm (?:ERR!|error) code E5\d\d/#.ignoresCase(),
            #/Response status code does not indicate success: 5\d\d/#.ignoresCase(),
            #/\b50[234] (?:Bad Gateway|Service Unavailable|Gateway Time-?out)\b/#.ignoresCase(),
            #/received unexpected HTTP status: 5\d\d/#.ignoresCase(),
        ]),
        entry("oom-kill", "the runner killed a process for using too much memory", [
            #/exit code 137\b/#.ignoresCase(),
            #/\bOOMKilled\b/#,
            #/Killed\s+.*(?:out of memory|oom)/#.ignoresCase(),
        ]),
        entry("actions-service", "GitHub Actions itself failed", [
            #/Internal server error occurred while resolving "actions\//#.ignoresCase(),
            #/Unable to download artifact/#.ignoresCase(),
            #/Failed to download action/#.ignoresCase(),
            #/An error occurred while provisioning resources/#.ignoresCase(),
            #/Cache service responded with 5\d\d/#.ignoresCase(),
            #/Failed to CreateArtifact/#.ignoresCase(),
        ]),
    ]

    private static func entry(_ id: String, _ label: String, _ patterns: [Regex<Substring>]) -> Entry {
        Entry(id: id, label: label, patterns: patterns.map(\.asInJavaScript))
    }
}
