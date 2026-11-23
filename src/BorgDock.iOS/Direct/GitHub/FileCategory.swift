import Foundation

/// How Quick Review walks a changed file. The server's `github/file-category.ts` and the desktop's
/// `reviewFileCategory` / `isGeneratedPath` follow the same patterns; change all three together.
enum FileCategory {
    private static let lockfiles: Set<String> = [
        "bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "cargo.lock", "package.resolved", "podfile.lock",
    ]

    /// Snapshots and load-test reports sit inside test folders, yet nobody reads them line by line.
    private static let snapshots = Pattern(#"\.snap$|(^|/)__snapshots__/|-snapshots/|(^|/)loadtests/reports/"#)

    private static let tests = [
        Pattern(#"(^|/)[^/]*\.Tests(/|$)"#),
        Pattern(#"(^|/)(tests?|__tests__)(/|$)"#),
        Pattern(#"\.(test|spec)\."#),
        Pattern(#"(^|/)[^/]*(Tests|Testing)/"#, caseSensitive: true),
        Pattern(#"(^|/)e2e/"#),
        Pattern(#"(^|/)(fixtures|__fixtures__|test-fixtures|__mocks__)/"#),
        Pattern(#"(^|/)\.storybook/mocks/"#),
        Pattern(#"\.stories\."#),
        Pattern(#"(^|/)loadtests/"#),
    ]

    private static let generatedNames = [
        #"\.lock\.json$"#, #"\.generated\."#, #"\.g\.(cs|ts|dart)$"#, #"\.min\.js$"#, #"\.(js|css)\.map$"#, #"\.designer\.cs$"#, #"\.pbxproj$"#,
    ].map { Pattern($0, caseSensitive: true) }

    private static let generatedFolders = [
        Pattern(#"(^|/)generated/"#), Pattern(#"^(?:(?!src/)[^/]+/)?(dist|obj)/"#), Pattern(#"(^|/)src-tauri/gen/"#),
    ]

    private static let binary = Pattern(#"\.(wasm|png|jpe?g|gif|webp|pdf|ico|woff2?|ttf)$"#)

    private static let docs = Pattern(#"(^|/)(docs?|documentation)(/|$)|\.(md|mdx|rst)$"#)

    /// `hasPatch` is false when GitHub sent no diff (a binary file): an image or font without one is generated.
    static func of(_ path: String, hasPatch: Bool) -> PrFileCategory {
        let normalized = path.replacingOccurrences(of: "\\", with: "/")
        let name = (normalized.split(separator: "/").last.map(String.init) ?? "").lowercased()
        if snapshots.matches(normalized) { return .generated }
        if tests.contains(where: { $0.matches(normalized) }) { return .tests }
        if isGenerated(normalized, name: name, hasPatch: hasPatch) { return .generated }
        if docs.matches(normalized) { return .docs }
        return .source
    }

    private static func isGenerated(_ path: String, name: String, hasPatch: Bool) -> Bool {
        if lockfiles.contains(name) || generatedNames.contains(where: { $0.matches(name) }) { return true }
        if generatedFolders.contains(where: { $0.matches(path) }) { return true }
        return !hasPatch && binary.matches(name)
    }
}

/// A regular expression kept as text, so it can sit in a static constant; case is ignored unless said otherwise.
private struct Pattern: Sendable {
    let source: String
    let caseSensitive: Bool

    init(_ source: String, caseSensitive: Bool = false) {
        self.source = source
        self.caseSensitive = caseSensitive
    }

    func matches(_ text: String) -> Bool {
        text.range(of: source, options: caseSensitive ? [.regularExpression] : [.regularExpression, .caseInsensitive]) != nil
    }
}
