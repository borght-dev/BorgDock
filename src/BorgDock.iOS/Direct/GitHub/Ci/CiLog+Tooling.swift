import Foundation

// The tools around the code: npm, pnpm and bun installs, and Docker builds.

enum PackageManagerLog {
    private nonisolated(unsafe) static let npmDetailKey = #/^(?:code|errno|syscall|path|dest|command|cwd|signal|file)\b/#.asInJavaScript
    private nonisolated(unsafe) static let exitStatus = #/^\d+$/#.asInJavaScript
    private nonisolated(unsafe) static let pnpm = #/^\s*(ERR_PNPM_[A-Z0-9_]+)\s+(.+)$/#.asInJavaScript
    private nonisolated(unsafe) static let bun = #/^error: (.+ failed to resolve|lockfile had changes, but lockfile is frozen|No version matching .+|package "[^"]+" not found.*)$/#.asInJavaScript
    private nonisolated(unsafe) static let bunFetch = #/^error: GET \S+ - (\d{3})$/#.asInJavaScript

    static func signals(in lines: [String]) -> [CiSignal] { npmErrors(in: lines) + pnpmErrors(in: lines) + bunErrors(in: lines) }

    /// What npm says on an error line (`npm ERR! …`, `npm error …`); nil for any other line.
    private static func npmText(_ line: String) -> String? {
        let rest: Substring
        if line.hasPrefix("npm ERR!") {
            rest = line.dropFirst(8)
        } else if line.hasPrefix("npm error") {
            rest = line.dropFirst(9)
        } else {
            return nil
        }
        return rest.isEmpty || rest.hasPrefix(" ") ? rest.trimmed : nil
    }

    /// `npm ERR! code E404` and the lines npm adds to it. A script's own exit (`ELIFECYCLE`, a number) is not
    /// npm's failure.
    private static func npmErrors(in lines: [String]) -> [CiSignal] {
        var signals: [CiSignal] = []
        var index = 0
        while index < lines.count {
            guard let text = npmText(lines[index]), text.hasPrefix("code ") else {
                index += 1
                continue
            }
            let code = String(text.dropFirst(5))
            var details: [String] = []
            for line in lines[(index + 1)...] {
                guard let detail = npmText(line), !detail.hasPrefix("code ") else { break }
                details.append(detail)
            }
            let end = index + 1 + details.count
            if code != "ELIFECYCLE", code.wholeMatch(of: exitStatus) == nil {
                let message = details.first { !$0.isEmpty && $0.prefixMatch(of: npmDetailKey) == nil } ?? "npm \(code)"
                signals.append(CiSignal(kind: .tooling, parser: "npm", message: message, code: code, excerpt: lines[index..<end].map(\.trimmedEnd)))
            }
            index = end
        }
        return signals
    }

    private static func pnpmErrors(in lines: [String]) -> [CiSignal] {
        lines.compactMap { line in
            line.wholeMatch(of: pnpm).map { CiSignal(kind: .tooling, parser: "npm", message: $0.2.trimmed, code: String($0.1), excerpt: [line.trimmed]) }
        }
    }

    /// Bun's install errors, with the registry's status from the `error: GET … - 404` line just above one.
    private static func bunErrors(in lines: [String]) -> [CiSignal] {
        lines.indices.compactMap { index in
            guard let match = lines[index].wholeMatch(of: bun) else { return nil }
            let fetch = lines[max(0, index - 3)..<index].reversed().lazy
                .compactMap { line in line.wholeMatch(of: bunFetch).map { (line: line, status: $0.1) } }
                .first
            return CiSignal(
                kind: .tooling, parser: "npm", message: match.1.trimmed, code: fetch.map { "E\($0.status)" },
                excerpt: [fetch?.line, lines[index]].compactMap { $0 }
            )
        }
    }
}

enum DockerLog {
    private nonisolated(unsafe) static let stepError = #/^#\d+ ERROR: (.+)$/#.asInJavaScript
    private nonisolated(unsafe) static let solveError = #/^ERROR: (?:failed to build: )?failed to solve: (.+)$/#.asInJavaScript
    private nonisolated(unsafe) static let classicError = #/^The command '.+' returned a non-zero code: \d+$/#.asInJavaScript
    private nonisolated(unsafe) static let dockerfileLine = #/^(\S*Dockerfile\S*):(\d+)$/#.asInJavaScript
    /// What BuildKit reported about a failure is looked for this many lines above it.
    private static let reportLines = 60

    static func signals(in lines: [String]) -> [CiSignal] {
        var signals: [CiSignal] = []
        var steps: [(index: Int, message: String)] = []
        for (index, line) in lines.enumerated() {
            if let step = line.wholeMatch(of: stepError) {
                steps.append((index, String(step.1)))
            } else if let solve = line.wholeMatch(of: solveError) {
                let message = solve.1.trimmed
                // The solve error restates the step that failed: one signal for both.
                steps.removeAll { message.contains($0.message.trimmed) }
                signals.append(failure(at: index, in: lines, message: message))
            } else if line.wholeMatch(of: classicError) != nil {
                signals.append(failure(at: index, in: lines, message: line.trimmed))
            }
        }
        return signals + steps.map { failure(at: $0.index, in: lines, message: $0.message.trimmed) }
    }

    /// A failure with what BuildKit reported above it: the Dockerfile line, and the output of the command that
    /// failed (under `> [build 4/7] RUN …`).
    private static func failure(at index: Int, in lines: [String], message: String) -> CiSignal {
        let report = lines[max(0, index - reportLines)..<index]
        let place = report.reversed().lazy.compactMap { $0.wholeMatch(of: dockerfileLine) }.first
        var output: [String] = []
        if let start = report.lastIndex(where: { $0.trimmedStart.hasPrefix("> [") }) {
            for line in report[start...].map(\.trimmed) {
                if line == "------" { break }
                if !line.isEmpty { output.append(line) }
            }
        }
        return CiSignal(
            kind: .tooling, parser: "docker", message: message, path: place.map { String($0.1) }, line: place.flatMap { Int($0.2) },
            excerpt: output.isEmpty ? [lines[index].trimmed] : output
        )
    }
}
