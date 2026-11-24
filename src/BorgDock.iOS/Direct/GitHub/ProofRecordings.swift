import Foundation

/// A screen recording in a description or comment: a video GitHub plays on the pull request's page.
struct ProofRecording: Hashable, Sendable {
    let url: String
    let label: String
}

/// A tool's footer between its own markers (`<!-- codesmith:footer -->` … `<!-- /codesmith:footer -->`): never proof
/// and never shown.
enum BotFooters {
    static func removed(from body: String) -> String {
        body.replacing(footer, with: "")
    }

    private nonisolated(unsafe) static let footer = #/(?i)<!--\s*([A-Za-z0-9_.-]+):footer\s*-->[\s\S]*?<!--\s*\/\1:footer\s*-->/#
}

/// The recordings in a description or comment: `<video>` elements, links to a video file, and uploads on a line of
/// their own. GitHub writes an uploaded image as `![…](…)` and an uploaded video as its bare address. The desktop's
/// `proofRecordings` (`services/review-proof.ts`) in Swift; `ProofRecordingsTests` reuses its cases.
enum ProofRecordings {
    static func find(in markdown: String) -> [ProofRecording] {
        let body = BotFooters.removed(from: markdown.replacingOccurrences(of: "\r\n", with: "\n"))
        var found: [String] = []
        for video in body.matches(of: video) {
            let sources = [value(of: source, in: video.output.1)] + video.output.2.matches(of: sourceTag).map { value(of: source, in: $0.output) }
            found += sources.compactMap { $0 }.filter(isWebAddress)
        }
        for anchor in body.matches(of: anchor) {
            if let address = value(of: target, in: anchor.output), isWebAddress(address), isVideoFile(address) { found.append(address) }
        }
        for link in body.matches(of: markdownLink) where isVideoFile(String(link.output.1)) {
            found.append(String(link.output.1))
        }
        for line in body.matches(of: bareLine) {
            let address = String(line.output.1)
            if isVideoFile(address) || isUpload(address) { found.append(address) }
        }
        var seen: Set<String> = []
        let addresses = found.filter { seen.insert($0).inserted }
        return addresses.enumerated().map { index, address in
            ProofRecording(url: address, label: addresses.count > 1 ? "Recording \(index + 1)" : "Recording")
        }
    }

    /// An address that ends in a video file's extension, whatever follows its `?` or `#`.
    static func isVideoFile(_ address: String) -> Bool {
        address.firstMatch(of: videoFile) != nil
    }

    /// An upload to a pull request or comment; GitHub gives these no file extension.
    static func isUpload(_ address: String) -> Bool {
        address.wholeMatch(of: upload) != nil
    }

    /// The body without the lines that are only an uploaded recording's address: on GitHub the player stands there,
    /// and here the recording is shown elsewhere on the screen.
    static func withoutUploadLines(_ markdown: String) -> String {
        markdown.replacingOccurrences(of: "\r\n", with: "\n").replacing(bareLine) { line in
            isUpload(String(line.output.1)) ? "" : String(line.output.0)
        }
    }

    private static func isWebAddress(_ address: String) -> Bool {
        address.prefixMatch(of: #/(?i)https?:\/\//#) != nil
    }

    private static func value(of attribute: Regex<(Substring, Substring?, Substring?, Substring?)>, in tag: Substring) -> String? {
        guard let match = tag.firstMatch(of: attribute), let value = match.output.1 ?? match.output.2 ?? match.output.3 else { return nil }
        return value.replacingOccurrences(of: "&amp;", with: "&")
    }

    private nonisolated(unsafe) static let video = #/(?i)<video\b([^>]*)>([\s\S]*?)(?:<\/video>|\z)/#
    private nonisolated(unsafe) static let sourceTag = #/(?i)<source\b[^>]*>/#
    private nonisolated(unsafe) static let anchor = #/(?i)<a\b[^>]*>/#
    private nonisolated(unsafe) static let source = #/(?i)\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/#
    private nonisolated(unsafe) static let target = #/(?i)\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/#
    private nonisolated(unsafe) static let markdownLink = #/\[[^\]]*\]\(\s*<?(https?:\/\/[^\s)>]+)>?[^)]*\)/#
    private nonisolated(unsafe) static let bareLine = #/(?m)^[ \t]*(https?:\/\/\S+)[ \t]*$/#
    private nonisolated(unsafe) static let videoFile = #/(?i)\.(?:mp4|mov|webm|m4v)(?:[?#]\S*)?$/#
    private nonisolated(unsafe) static let upload = #/(?i)https:\/\/github\.com\/(?:user-attachments\/assets\/[A-Za-z0-9_-]+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/assets\/[0-9]+\/[A-Za-z0-9_-]+)/#
}
