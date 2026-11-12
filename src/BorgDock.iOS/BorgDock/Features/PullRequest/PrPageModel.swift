import Foundation

/// The pull request page's sections, in the order they show and with the jump chips over them.
enum PrPageSection: String, CaseIterable, Hashable {
    case checks, proof, description, comments, files

    var title: String {
        switch self {
        case .checks: "Checks"
        case .proof: "Proof"
        case .description: "Description"
        case .comments: "Comments"
        case .files: "Files"
        }
    }

    /// Checks lead while one fails; otherwise the description does and checks follow it. Proof shows only with images.
    static func order(failing: Bool, hasProof: Bool) -> [PrPageSection] {
        let sections: [PrPageSection] = failing
            ? [.checks, .proof, .description, .comments, .files]
            : [.proof, .description, .checks, .comments, .files]
        return sections.filter { $0 != .proof || hasProof }
    }

    static func jumpItems(_ sections: [PrPageSection], proof: Int, comments: Int, files: Int) -> [JumpBar.Item] {
        sections.map { section in
            let count: Int? = switch section {
            case .checks, .description: nil
            case .proof: proof
            case .comments: comments
            case .files: files
            }
            return JumpBar.Item(id: section.rawValue, title: section.title, count: count)
        }
    }

    /// The section being read: the last one whose top has passed the reading line, 40 % down the visible page.
    static func visible(_ sections: [PrPageSection], tops: [PrPageSection: CGFloat], line: CGFloat) -> PrPageSection? {
        sections.last { (tops[$0] ?? .infinity) <= line } ?? sections.first
    }
}

/// The nav bar's title once the header scrolls away: "Checkout: round totals per line instead of per order" reads
/// "Round totals per line".
enum PrTitle {
    static func short(_ title: String) -> String {
        var text = title.trimmingCharacters(in: .whitespaces)
        if let scope = text.firstMatch(of: #/^[\w./-]+(?:\([^)]*\))?!?:\s+/#), scope.range.upperBound < text.endIndex {
            text = String(text[scope.range.upperBound...])
        }
        for clause in [" instead of ", " so that ", " because "] {
            if let range = text.range(of: clause), text[..<range.lowerBound].split(separator: " ").count >= 3 {
                text = String(text[..<range.lowerBound])
                break
            }
        }
        return text.prefix(1).uppercased() + text.dropFirst()
    }
}

/// "2 of 24 failing", "3 running", "24 passed": the Checks section's trailing label.
enum ChecksLabel {
    static func text(_ runs: [CheckRun]) -> String {
        let failed = runs.filter { $0.state == .failure }.count
        let running = runs.filter { $0.state == .pending }.count
        if failed > 0 { return "\(failed) of \(runs.count) failing" }
        if running > 0 { return "\(running) running" }
        return runs.isEmpty ? "" : "\(runs.count) passed"
    }
}

// MARK: - Failed checks

/// How long a job ran, as the check cards write it: "45 s", "4 min", "1 h 5 min".
enum CheckDuration {
    static func text(_ seconds: Int?) -> String {
        guard let seconds, seconds >= 0 else { return "" }
        if seconds < 60 { return "\(seconds) s" }
        let minutes = Int((Double(seconds) / 60).rounded())
        if minutes < 60 { return "\(minutes) min" }
        return minutes % 60 == 0 ? "\(minutes / 60) h" : "\(minutes / 60) h \(minutes % 60) min"
    }
}

/// How a line of a failure's log excerpt reads: what the test expected (red), what it got (green), plain, or dim.
enum LogTone: Equatable {
    case plain, expected, received, dim
}

enum LogLine {
    static func tone(_ line: String) -> LogTone {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("Expected") || trimmed.hasPrefix("- ") { return .expected }
        if trimmed.hasPrefix("Received") || trimmed.hasPrefix("+ ") { return .received }
        return .plain
    }

    /// A plain line's words, with rule ids such as `lint/style/useConst` dimmed; file paths keep their colour.
    static func segments(_ line: String) -> [(text: String, tone: LogTone)] {
        let tone = tone(line)
        guard tone == .plain else { return [(line, tone)] }
        var segments: [(text: String, tone: LogTone)] = []
        for word in line.split(separator: " ", omittingEmptySubsequences: false).map(String.init) {
            let wordTone: LogTone = word.wholeMatch(of: #/[a-z][\w-]*(?:\/[\w-]+)+/#) != nil ? .dim : .plain
            if let last = segments.last, last.tone == wordTone {
                segments[segments.count - 1].text += " " + word
            } else {
                segments.append((segments.isEmpty ? word : " " + word, wordTone))
            }
        }
        return segments
    }
}

enum FailureFacts {
    /// The failing test's spec file, when the PR changes it: "checkout.spec.ts:88" against "tests/e2e/checkout.spec.ts".
    static func changesSpec(_ failure: CheckFailure, files: [PrFile]) -> Bool {
        guard let spec = specFile(failure) else { return false }
        return files.contains { $0.path == spec || $0.path.hasSuffix("/" + spec) }
    }

    static func specFile(_ failure: CheckFailure) -> String? {
        let text = [failure.location, failure.snippet, failure.summary].compactMap(\.self).joined(separator: "\n")
        return text.firstMatch(of: #/[\w./-]+\.(?:spec|test)\.[A-Za-z]+/#).map { String($0.output) }
    }
}

// MARK: - Comments

/// Everything said on a pull request: review threads still open, the conversation (comments and review bodies, oldest
/// first) and the resolved threads, folded at the end.
struct PrComments {
    enum Entry: Identifiable, Hashable {
        case comment(PrComment)
        case review(PrReview)

        var id: String {
            switch self {
            case .comment(let comment): comment.id
            case .review(let review): "review-\(review.author.login)-\(review.at)"
            }
        }

        var author: Person {
            switch self {
            case .comment(let comment): comment.author
            case .review(let review): review.author
            }
        }

        var at: String {
            switch self {
            case .comment(let comment): comment.at
            case .review(let review): review.at
            }
        }

        var body: String {
            switch self {
            case .comment(let comment): comment.body
            case .review(let review): review.body
            }
        }

        var isReview: Bool {
            if case .review = self { return true }
            return false
        }
    }

    let open: [ReviewThread]
    let entries: [Entry]
    let resolved: [ReviewThread]

    init(conversation: PrConversation?, reviews: [PrReview]) {
        open = conversation?.threads.filter { !$0.isResolved } ?? []
        resolved = conversation?.threads.filter(\.isResolved) ?? []
        let comments = (conversation?.comments ?? []).map(Entry.comment)
        let summaries = reviews.filter { !$0.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.map(Entry.review)
        entries = (comments + summaries).sorted { $0.at < $1.at }
    }

    var count: Int {
        (open + resolved).reduce(0) { $0 + $1.comments.count } + entries.count
    }

    var isEmpty: Bool { open.isEmpty && entries.isEmpty && resolved.isEmpty }
}

/// GitHub apps post as `name[bot]`; a few tools post from plain accounts.
enum BotAuthor {
    static let tools: Set<String> = ["codesmith", "github-actions", "dependabot", "renovate", "vercel", "netlify", "codecov", "sonarcloud", "coderabbitai", "copilot"]

    static func isBot(_ login: String) -> Bool {
        login.lowercased().hasSuffix("[bot]") || tools.contains(name(login).lowercased())
    }

    static func name(_ login: String) -> String {
        login.replacingOccurrences(of: "[bot]", with: "", options: .caseInsensitive)
    }
}

/// How a comment shows: as written, as the E2E workflow's report, or folded to one row (a bot's review summary or a
/// long bot comment).
enum CommentPresentation: Equatable {
    case plain
    case e2eReport(failed: Int?, body: String)
    case folded(BotFold)

    static let longBotComment = 280

    static func of(author: Person, body: String, isReview: Bool) -> CommentPresentation {
        if let report = E2EReport.parse(body) { return .e2eReport(failed: report.failed, body: report.body) }
        guard BotAuthor.isBot(author.login) else { return .plain }
        let cleanup = MarkdownCleanup.clean(body)
        let text = cleanup.text.trimmingCharacters(in: .whitespacesAndNewlines)
        let long = text.count > longBotComment || text.split(separator: "\n").count > 5
        guard isReview || long || cleanup.removedFooter || cleanup.removedBadges > 0 else { return .plain }
        return .folded(BotFold(name: BotAuthor.name(author.login), kind: isReview ? "review summary" : "comment",
                               subtitle: BotFold.subtitle(text: text, cleanup: cleanup)))
    }
}

/// "codesmith · review summary", "3 notes · footer and badges hidden".
struct BotFold: Equatable {
    let name: String
    let kind: String
    let subtitle: String

    static func subtitle(text: String, cleanup: MarkdownCleanup.Result) -> String {
        var parts: [String] = []
        let notes = MarkdownParser.parse(text).reduce(0) { count, block in
            if case .list(let list) = block { return count + list.items.count }
            return count
        }
        if notes > 0 { parts.append(notes == 1 ? "1 note" : "\(notes) notes") }
        switch (cleanup.removedFooter, cleanup.removedBadges > 0) {
        case (true, true): parts.append("footer and badges hidden")
        case (true, false): parts.append("footer hidden")
        case (false, true): parts.append("badges hidden")
        case (false, false): break
        }
        if parts.isEmpty { return DescriptionExcerpt.excerpt(text) }
        return parts.joined(separator: " · ")
    }
}

/// The repository's E2E workflow comment: `## E2E Test Results`, then `### Failed Tests` with a table. The card takes
/// the title for itself and counts the table's rows.
enum E2EReport {
    static func parse(_ body: String) -> (failed: Int?, body: String)? {
        let lines = body.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        guard let title = lines.firstIndex(where: { $0.wholeMatch(of: #/\s{0,3}#{1,6}\s*E2E Test Results\s*#*\s*/#) != nil }) else { return nil }
        var rest = lines
        rest.remove(at: title)
        let failedHeading = rest.firstIndex { $0.wholeMatch(of: #/\s{0,3}#{1,6}\s*Failed Tests\s*#*\s*/#) != nil }
        if let failedHeading { rest.remove(at: failedHeading) }
        let text = rest.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        let blocks = MarkdownParser.parse(text)
        var failed: Int?
        if failedHeading != nil, let table = blocks.lazy.compactMap({ block -> MarkdownTable? in
            if case .table(let table) = block { return table }
            return nil
        }).first {
            failed = table.rows.count
        } else if let match = text.firstMatch(of: #/(\d+)\s+failed/#) {
            failed = Int(match.output.1)
        }
        return (failed, text)
    }
}
