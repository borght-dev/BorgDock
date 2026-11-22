import Foundation

// The port of the server's `ci/normalize.ts`, itself the desktop's src/services/ci-failures/normalize.ts.

/// Normalization for fingerprints: removes what differs between runs of the same failure (runner paths, temp names,
/// durations, ids, ephemeral ports) and keeps what tells failures apart (expected and actual values, error codes,
/// well-known ports).
enum CiNormalize {
    private nonisolated(unsafe) static let runnerRoots = [
        // GitHub-hosted Linux and macOS: /home/runner/work/<repo>/<repo>/
        #/(?:\/home\/runner|\/Users\/runner)\/work\/([^/\s]+)\/\1\//#,
        // GitHub-hosted Windows: D:\a\<repo>\<repo>\
        #/\b[A-Za-z]:[\\/]a[\\/]([^\\/\s]+)[\\/]\1[\\/]/#,
        // Self-hosted runners: …/_work/<repo>/<repo>/
        #/(?:[A-Za-z]:)?[^\s"'(]*[\\/]_work[\\/]([^\\/\s]+)[\\/]\1[\\/]/#,
    ].map(\.asInJavaScript)

    private nonisolated(unsafe) static let tempPaths = [
        #/(?:\/home\/runner\/work|\/Users\/runner\/work)\/_temp\/[^\s/'"]+/#,
        #/\b[A-Za-z]:[\\/]a[\\/]_temp[\\/][^\s\\/'"]+/#,
        #/\b[A-Za-z]:\\Users\\[^\\\s]+\\AppData\\Local\\Temp\\[^\s\\'"]+/#.ignoresCase(),
        #/\b[A-Za-z]:\\Users\\RUNNER~\d\\AppData\\Local\\Temp\\[^\s\\'"]+/#.ignoresCase(),
        #/\/(?:private\/)?(?:tmp|var\/folders\/[^\s/]+\/[^\s/]+\/T)\/[^\s/'"]+/#,
    ].map(\.asInJavaScript)

    private nonisolated(unsafe) static let duration = #/\b\d+(?:\.\d+)?\s?(?:ms|msec|milliseconds?|s|sec|secs|seconds?|m|min|mins|minutes?)\b/#.ignoresCase().asInJavaScript
    private nonisolated(unsafe) static let isoTime = #/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/#.asInJavaScript
    private nonisolated(unsafe) static let clock = #/\b\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\b/#.asInJavaScript
    private nonisolated(unsafe) static let guid = #/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/#.ignoresCase().asInJavaScript
    private nonisolated(unsafe) static let address = #/\b0x[0-9a-f]{6,}\b/#.ignoresCase().asInJavaScript
    /// Generated ids and SHAs: 8 or more hex characters with a digit among them (short commit SHAs are 7). All-digit
    /// runs count too: a hex id can happen to have no letters, and timestamps differ every run.
    private nonisolated(unsafe) static let generatedId = #/\b(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/#.ignoresCase().asInJavaScript
    private nonisolated(unsafe) static let processId = #/\b(pid|process id)[\s=:#]*\d+/#.ignoresCase().asInJavaScript
    private nonisolated(unsafe) static let hostPort = #/(\b(?:\d{1,3}\.){3}\d{1,3}|\blocalhost|\[::1\]|\[::\]):(\d{2,5})\b/#.ignoresCase().asInJavaScript
    /// From here up the system picks the port, a different one every run.
    private static let firstEphemeralPort = 32768

    private nonisolated(unsafe) static let whitespace = #/\s+/#.asInJavaScript
    private nonisolated(unsafe) static let parameters = #/^(.*?)\s*(?:\((.*)\)|\[(.*)\])\s*$/#.asInJavaScript
    private nonisolated(unsafe) static let placeholder = #/<[a-z]+>/#.asInJavaScript
    private nonisolated(unsafe) static let wordBreak = #/[^a-z0-9_.@/-]+/#.asInJavaScript

    /// A path relative to the repository root, forward slashes, no runner prefix.
    static func path(_ path: String) -> String {
        var result = path.trimmed
        for root in runnerRoots { result.replace(root, with: "") }
        result = result.replacing("\\", with: "/")
        return result.hasPrefix("./") ? String(result.dropFirst(2)) : result
    }

    /// `text` with run-specific details replaced by placeholders, whitespace collapsed.
    static func text(_ text: String) -> String {
        var result = text
        for temp in tempPaths { result.replace(temp, with: "<tmp>") }
        for root in runnerRoots { result.replace(root, with: "") }
        result.replace(isoTime, with: "<time>")
        result.replace(clock, with: "<time>")
        result.replace(guid, with: "<guid>")
        result.replace(address, with: "<addr>")
        result.replace(generatedId, with: "<id>")
        result.replace(processId) { "\($0.1) <n>" }
        result.replace(hostPort) { match in (Int(match.2) ?? 0) >= firstEphemeralPort ? "\(match.1):<port>" : String(match.0) }
        result.replace(duration, with: "<dur>")
        return singleLine(result)
    }

    /// `text` on one line: every run of whitespace a single space.
    static func singleLine(_ text: String) -> String { text.replacing(whitespace, with: " ").trimmed }

    /// A test's name without its parameters: `Pays(card: "visa")` → `Pays`.
    static func testIdentity(_ name: String) -> String {
        let single = singleLine(name)
        guard let match = single.wholeMatch(of: parameters), !match.1.isEmpty else { return single }
        return String(match.1)
    }

    /// True when `text` says only that something failed, with nothing to tell one failure from another.
    static func isGeneric(_ text: String) -> Bool {
        let words = self.text(text).lowercased().replacing(placeholder, with: " ").split(separator: wordBreak)
            .filter { word in !word.allSatisfy { ("0"..."9").contains($0) } }
        return words.count { !genericWords.contains(String($0)) } < 2
    }

    /// Words that alone say only that something failed.
    private static let genericWords: Set<String> = [
        "a", "an", "the", "with", "of", "to", "in", "is", "was", "has", "and", "or", "not",
        "error", "errors", "err", "fatal", "failed", "failure", "fail", "failing", "exception",
        "process", "completed", "exit", "exited", "code", "status", "command", "returned", "non", "zero",
        "timeout", "timed", "out", "exceeded", "connect", "connection", "refused", "econnrefused",
        "npm", "run", "step", "job", "test", "tests", "unknown", "unexpected", "something", "went", "wrong",
        "after", "while", "running", "see", "above", "log", "logs", "details", "for", "more", "information", "build",
    ]
}
