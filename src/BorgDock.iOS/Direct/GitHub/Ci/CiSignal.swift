import Foundation

/// One failure found in a job's log, sanitized but not normalized (fingerprinting normalizes).
struct CiSignal: Codable, Hashable, Sendable {
    enum Kind: String, Codable, Sendable {
        case test, compile, lint, annotation, tooling, generic
        /// A test run's totals, never a failure of its own.
        case summary
    }

    static let maxPerJob = 20
    static let maxExcerptLines = 30
    static let maxLineCharacters = 240
    static let maxFrames = 5

    var kind: Kind
    /// msbuild, dotnet-test, typescript, eslint, playwright, vitest, cargo-test, rustc, npm, docker, actions-annotation, generic.
    var parser: String
    /// The first line that says what went wrong.
    var message: String
    var testId: String?
    var params: String?
    var path: String?
    var line: Int?
    var column: Int?
    var code: String?
    var errorClass: String?
    var expected: String?
    var actual: String?
    var excerpt: [String] = []
    var frames: [String] = []
    /// How often the same failure repeated in this job (retries).
    var repeats = 1

    /// The signal within the limits: every line and field cut at `maxLineCharacters`, the excerpt and the frames
    /// at their counts.
    var capped: CiSignal {
        func cut(_ text: String) -> String { text.clipped(to: Self.maxLineCharacters) }
        var capped = self
        capped.excerpt = excerpt.prefix(Self.maxExcerptLines).map(cut)
        capped.frames = frames.prefix(Self.maxFrames).map(cut)
        capped.message = cut(message)
        capped.testId = testId.map(cut)
        capped.params = params.map(cut)
        capped.path = path.map(cut)
        capped.code = code.map(cut)
        capped.errorClass = errorClass.map(cut)
        capped.expected = expected.map(cut)
        capped.actual = actual.map(cut)
        return capped
    }
}
