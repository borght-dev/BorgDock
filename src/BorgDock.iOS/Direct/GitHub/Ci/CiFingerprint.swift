import Foundation

// The port of the server's `ci/fingerprint.ts`, itself the desktop's src/services/ci-failures/fingerprint.ts. Equal
// fingerprints mean "the same failure" on every side, so a rule changes on all of them together.

/// What one failure signal is the same failure as. The tier says how far to trust that.
struct CiFingerprint: Hashable, Sendable {
    enum Tier: String, Codable, Sendable {
        /// Equal fingerprints are the same failure.
        case high
        /// Possibly the same: an infrastructure fault without its step, or equal text no parser knew.
        case medium
        /// Says only that something failed; never grouped.
        case low
    }

    /// The version of the rules, catalog included. Raise it when a rule changes what matches: failures read under
    /// an older one are read again.
    static let version = 2 * 100 + CiCatalog.version

    /// The longest group title; the signal text it comes from is already cut at 240 characters.
    private static let titleLimit = 240

    let value: String
    let tier: Tier
    /// A short name for a group this fingerprint starts.
    let title: String

    /// The fingerprint of one failure signal, or nil for a test run's totals. `workflow` is the workflow's name.
    static func of(_ signal: CiSignal, failedStep: String?, workflow: String?) -> CiFingerprint? {
        guard signal.kind != .summary else { return nil }
        let catalog = CiCatalog.match(([signal.message] + signal.excerpt).joined(separator: "\n"))
        let step = failedStep.nonEmpty.map(CiNormalize.text).nonEmpty
        let path = signal.path.nonEmpty.map(CiNormalize.path).nonEmpty
        let testId = signal.testId.nonEmpty.map { CiNormalize.testIdentity(CiNormalize.path($0)) }.nonEmpty
        let inPath = path.map { " in \($0)" } ?? ""
        func make(_ value: String, _ tier: Tier, title: String) -> CiFingerprint {
            CiFingerprint(value: value, tier: tier, title: CiNormalize.singleLine(title).clipped(to: titleLimit))
        }

        if signal.kind == .test, let testId {
            return make("test:\(signal.parser):\(testId)|\(signal.errorClass ?? "")|\(messageKey(signal))", .high, title: testId)
        }
        if signal.kind == .compile, let code = signal.code.nonEmpty {
            return make("compile:\(code):\(path ?? "")|\(hash(CiNormalize.text(signal.message)))", .high, title: code + inPath)
        }
        if signal.kind == .lint {
            let rule = signal.code ?? hash(CiNormalize.text(signal.message))
            return make("lint:\(rule):\(path ?? "")", .high, title: (signal.code ?? "Lint") + inPath)
        }
        if let catalog {
            let label = catalog.label.prefix(1).uppercased() + catalog.label.dropFirst()
            return make("infra:\(catalog.id):\(step ?? ""):\(workflow ?? "")", step == nil ? .medium : .high, title: step.map { "\(label) (\($0))" } ?? label)
        }
        if CiNormalize.isGeneric(signal.message) {
            return make("generic:\(step ?? "")|\(messageKey(signal))", .low, title: signal.message)
        }
        switch signal.kind {
        case .tooling:
            let title = signal.code.nonEmpty.map { "\($0): \(signal.message)" } ?? signal.message
            return make("tooling:\(signal.parser):\(signal.code ?? "")|\(messageKey(signal))", .high, title: title)
        case .annotation:
            return make("annotation:\(path ?? "")|\(messageKey(signal))", .high, title: signal.message)
        default:
            // The generic fallback guesses from words alone: equal text shares a group that says "possibly the
            // same", never a confident one.
            return make("text:\(step ?? "")|\(messageKey(signal))", .medium, title: signal.message)
        }
    }

    /// The message, error class and expected/actual values: what makes two failures of one test the same.
    private static func messageKey(_ signal: CiSignal) -> String {
        hash([
            CiNormalize.text(signal.message), signal.errorClass ?? "", CiNormalize.text(signal.expected ?? ""), CiNormalize.text(signal.actual ?? ""),
        ].joined(separator: "\u{0}"))
    }

    /// cyrb53 over the text's UTF-16, as 14 hex digits: a fast, stable 53-bit hash, the same digits JavaScript gives.
    static func hash(_ text: String) -> String {
        var h1: UInt32 = 0xdead_beef
        var h2: UInt32 = 0x41c6_ce57
        for unit in text.utf16 {
            h1 = (h1 ^ UInt32(unit)) &* 2_654_435_761
            h2 = (h2 ^ UInt32(unit)) &* 1_597_334_677
        }
        h1 = ((h1 ^ (h1 >> 16)) &* 2_246_822_507) ^ ((h2 ^ (h2 >> 13)) &* 3_266_489_909)
        h2 = ((h2 ^ (h2 >> 16)) &* 2_246_822_507) ^ ((h1 ^ (h1 >> 13)) &* 3_266_489_909)
        let digits = String(UInt64(h2 & 0x1f_ffff) << 32 | UInt64(h1), radix: 16)
        return String(repeating: "0", count: max(0, 14 - digits.count)) + digits
    }
}
