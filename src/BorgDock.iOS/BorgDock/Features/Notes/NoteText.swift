import Foundation

/// A reference a note makes to something BorgDock knows. The same tokens as the desktop's `services/notes/parse.ts`.
enum NoteRef: Hashable, Sendable {
    /// `AB#123`, or an ADO work item URL.
    case item(id: Int)
    /// `owner/repo#12`, `repo#12`, or a GitHub pull request URL.
    case pullRequest(owner: String?, repo: String, number: Int)
    /// `[label](t3code://threads/<environment>/<thread>)`
    case thread(environmentId: String, threadId: String, label: String)
    /// `[label](borgdock://workstreams/<id>)`
    case workstream(id: String, label: String)

    /// What the chip says before the server answers: "AB#61044", "shop#3712".
    var display: String {
        switch self {
        case .item(let id): "AB#\(id)"
        case .pullRequest(_, let repo, let number): "\(repo)#\(number)"
        case .thread(_, _, let label): label.isEmpty ? "Thread" : label
        case .workstream(_, let label): label.isEmpty ? "Workstream" : label
        }
    }

    /// The key sent to `POST /api/refs/resolve`. Pull requests with an owner and threads use the contract's
    /// identities; `AB#123` and `repo#12` go as written and the server resolves them against its configured
    /// organization and repositories.
    var resolveKey: String? {
        switch self {
        case .item(let id): "AB#\(id)"
        case .pullRequest(let owner?, let repo, let number): "gh:github.com/\(owner)/\(repo)#\(number)".lowercased()
        case .pullRequest(nil, let repo, let number): "\(repo)#\(number)"
        case .thread(let environmentId, let threadId, _): "t3:\(environmentId)/\(threadId)"
        case .workstream: nil
        }
    }
}

/// One piece of a line of note text.
enum NoteSpan: Hashable, Sendable {
    /// Markdown inline text: emphasis and code are still in it.
    case text(String)
    case ref(NoteRef)
    /// `[[Target]]`, `[[Target#heading]]`, `[[Target|label]]`
    case wikilink(target: String, label: String?)
    /// `[label](https://…)`, or a bare URL.
    case link(url: URL, label: String)
}

/// A line-level piece of a note, for the reader.
enum NoteBlock: Hashable, Sendable {
    case heading(level: Int, text: String, line: Int)
    case task(done: Bool, text: String, indent: Int, line: Int)
    case bullet(text: String, indent: Int, ordinal: String?, line: Int)
    case paragraph(text: String, line: Int)
    case quote(text: String, line: Int)
    case code(text: String, line: Int)
    /// BorgDock's text between `<!-- borgdock:<id> -->` markers, with the heading right above it when there is one.
    case borgdock(id: String, title: String?, lines: [String], line: Int)
    case rule(line: Int)
}

/// A task as `setTask` finds it: its line and text.
struct NoteTask: Hashable, Sendable {
    let line: Int
    let done: Bool
    let text: String
}

enum NoteText {
    private nonisolated(unsafe) static let wikilink = /\[\[([^\]\n|#]+)(?:#([^\]\n|]+))?(?:\|([^\]\n]+))?\]\]/
    private nonisolated(unsafe) static let markdownLink = /\[([^\]\n]*)\]\(([^)\s]+)\)/
    private nonisolated(unsafe) static let urlRun = /\b(?:https?|t3code|borgdock):\/\/\S+/
    /// Lookbehind is checked by hand (`preceded`): AB# must not follow a word character, `#` or `/`.
    private nonisolated(unsafe) static let ado = /AB#(\d{1,9})\b/.ignoresCase()
    /// Nor may `owner/repo#12` follow a word character, `/`, `#`, `.` or `-`.
    private nonisolated(unsafe) static let pr = /(?:([\w.\-]+)\/)?([\w.\-]+)#(\d{1,7})\b/
    private nonisolated(unsafe) static let inlineCode = /`[^`\n]*`/
    private nonisolated(unsafe) static let prURL = /^https?:\/\/(?:www\.)?github\.com\/([\w.\-]+)\/([\w.\-]+)\/pull\/(\d+)/.ignoresCase()
    private nonisolated(unsafe) static let adoURL = /^https?:\/\/dev\.azure\.com\/([^\/\s]+)\/([^\/\s]+)\/_workitems\/edit\/(\d+)/.ignoresCase()
    private nonisolated(unsafe) static let threadURL = /^t3code:\/\/threads\/([^\/\s]+)\/([^\/\s?#)]+)/
    private nonisolated(unsafe) static let workstreamURL = /^borgdock:\/\/workstreams\/([^\/\s?#)]+)/
    nonisolated(unsafe) static let taskLine = /^(\s*)[-*+] \[([ xX])\] (.*)$/
    private nonisolated(unsafe) static let bulletLine = /^(\s*)([-*+]|\d+[.)]) (.*)$/
    private nonisolated(unsafe) static let headingLine = /^(#{1,6}) +(.+?)\s*#*\s*$/
    private nonisolated(unsafe) static let fence = /^\s*(```|~~~)/
    private nonisolated(unsafe) static let markerStart = /^\s*<!-- borgdock:(.+?) -->\s*$/

    // MARK: Inline

    /// The spans of one line, in order. Inline code never holds a reference.
    static func spans(_ line: String) -> [NoteSpan] {
        struct Found { let range: Range<String.Index>; let span: NoteSpan }
        var found: [Found] = []
        var taken: [Range<String.Index>] = []
        func free(_ range: Range<String.Index>) -> Bool { !taken.contains { $0.overlaps(range) } }
        func take(_ range: Range<String.Index>, _ span: NoteSpan?) {
            taken.append(range)
            if let span { found.append(Found(range: range, span: span)) }
        }

        for match in line.matches(of: inlineCode) { take(match.range, nil) }
        for match in line.matches(of: wikilink) where free(match.range) {
            let label = match.output.3.map { String($0).trimmingCharacters(in: .whitespaces) }
            take(match.range, .wikilink(target: String(match.output.1).trimmingCharacters(in: .whitespaces), label: label))
        }
        for match in line.matches(of: markdownLink) where free(match.range) {
            let label = String(match.output.1).trimmingCharacters(in: .whitespaces)
            let target = String(match.output.2)
            if let thread = target.firstMatch(of: threadURL) {
                take(match.range, .ref(.thread(environmentId: decode(thread.output.1), threadId: decode(thread.output.2), label: label)))
            } else if let workstream = target.firstMatch(of: workstreamURL) {
                take(match.range, .ref(.workstream(id: decode(workstream.output.1), label: label)))
            } else if let ref = urlRef(target) {
                take(match.range, .ref(ref))
            } else if let url = URL(string: target), url.scheme != nil {
                take(match.range, .link(url: url, label: label.isEmpty ? target : label))
            }
        }
        for match in line.matches(of: urlRun) where free(match.range) {
            let text = String(match.output).trimmingCharacters(in: CharacterSet(charactersIn: ".,;:)"))
            let range = match.range.lowerBound..<line.index(match.range.lowerBound, offsetBy: text.count)
            if let ref = urlRef(text) {
                take(range, .ref(ref))
            } else if let url = URL(string: text) {
                take(range, .link(url: url, label: text))
            } else {
                take(range, nil)
            }
        }
        func preceded(_ range: Range<String.Index>, by characters: String) -> Bool {
            guard range.lowerBound > line.startIndex else { return false }
            let before = line[line.index(before: range.lowerBound)]
            return before.isLetter || before.isNumber || before == "_" || characters.contains(before)
        }
        for match in line.matches(of: ado) where free(match.range) && !preceded(match.range, by: "#/") {
            if let id = Int(match.output.1) { take(match.range, .ref(.item(id: id))) }
        }
        for match in line.matches(of: pr) where free(match.range) && !preceded(match.range, by: "/#.-") {
            let owner = match.output.1.map(String.init)
            let repo = String(match.output.2)
            if owner == nil, repo.lowercased() == "ab" { continue }
            if let number = Int(match.output.3) { take(match.range, .ref(.pullRequest(owner: owner, repo: repo, number: number))) }
        }

        found.sort { $0.range.lowerBound < $1.range.lowerBound }
        var spans: [NoteSpan] = []
        var cursor = line.startIndex
        for item in found {
            if cursor < item.range.lowerBound { spans.append(.text(String(line[cursor..<item.range.lowerBound]))) }
            spans.append(item.span)
            cursor = item.range.upperBound
        }
        if cursor < line.endIndex { spans.append(.text(String(line[cursor...]))) }
        return spans
    }

    /// Every reference in a text, once each, in order of appearance.
    static func refs(in text: String) -> [NoteRef] {
        var seen = Set<NoteRef>()
        var refs: [NoteRef] = []
        for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
            for case .ref(let ref) in spans(String(line)) where seen.insert(ref).inserted {
                refs.append(ref)
            }
        }
        return refs
    }

    /// Every `[[link]]` target in a text, lower-cased.
    static func wikilinkTargets(in text: String) -> Set<String> {
        Set(text.matches(of: wikilink).map { String($0.output.1).trimmingCharacters(in: .whitespaces).lowercased() })
    }

    private static func urlRef(_ text: String) -> NoteRef? {
        if let match = text.firstMatch(of: prURL), let number = Int(match.output.3) {
            return .pullRequest(owner: String(match.output.1), repo: String(match.output.2), number: number)
        }
        if let match = text.firstMatch(of: adoURL), let id = Int(match.output.3) {
            return .item(id: id)
        }
        return nil
    }

    private static func decode(_ part: Substring) -> String {
        String(part).removingPercentEncoding ?? String(part)
    }

    // MARK: Blocks

    /// The note's blocks for the reader. Frontmatter is skipped; code fences are kept as text.
    static func blocks(_ text: String) -> [NoteBlock] {
        let lines = text.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        var blocks: [NoteBlock] = []
        var index = 0
        if lines.first?.trimmingCharacters(in: .whitespaces) == "---",
           let end = lines.dropFirst().firstIndex(where: { $0.trimmingCharacters(in: .whitespaces) == "---" }) {
            index = end + 1
        }
        var paragraph: [String] = []
        var paragraphStart = 0
        func flush() {
            if !paragraph.isEmpty { blocks.append(.paragraph(text: paragraph.joined(separator: " "), line: paragraphStart)) }
            paragraph = []
        }

        while index < lines.count {
            let line = lines[index]
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty {
                flush()
                index += 1
                continue
            }
            if line.firstMatch(of: fence) != nil {
                flush()
                let start = index
                var body: [String] = []
                index += 1
                while index < lines.count, lines[index].firstMatch(of: fence) == nil {
                    body.append(lines[index])
                    index += 1
                }
                blocks.append(.code(text: body.joined(separator: "\n"), line: start))
                index += 1
                continue
            }
            if let marker = line.firstMatch(of: markerStart) {
                flush()
                let id = String(marker.output.1)
                let start = index
                var body: [String] = []
                index += 1
                while index < lines.count, !lines[index].contains("<!-- /borgdock:\(id) -->") {
                    if !lines[index].trimmingCharacters(in: .whitespaces).isEmpty { body.append(lines[index]) }
                    index += 1
                }
                var title: String?
                if case .heading(_, let heading, _) = blocks.last {
                    title = heading
                    blocks.removeLast()
                }
                blocks.append(.borgdock(id: id, title: title, lines: body, line: start))
                index += 1
                continue
            }
            if let heading = line.firstMatch(of: headingLine) {
                flush()
                blocks.append(.heading(level: heading.output.1.count, text: String(heading.output.2), line: index))
            } else if let task = line.firstMatch(of: taskLine) {
                flush()
                blocks.append(.task(done: task.output.2 != " ", text: String(task.output.3), indent: task.output.1.count / 2, line: index))
            } else if let bullet = line.firstMatch(of: bulletLine) {
                flush()
                let marker = String(bullet.output.2)
                blocks.append(.bullet(text: String(bullet.output.3), indent: bullet.output.1.count / 2, ordinal: marker.first?.isNumber == true ? marker : nil, line: index))
            } else if trimmed.hasPrefix(">") {
                flush()
                blocks.append(.quote(text: String(trimmed.dropFirst()).trimmingCharacters(in: .whitespaces), line: index))
            } else if ["---", "***", "___"].contains(trimmed) {
                flush()
                blocks.append(.rule(line: index))
            } else if line.hasPrefix("  "), case .bullet(let text, let indent, let ordinal, let at)? = blocks.last, paragraph.isEmpty {
                // A continuation of a bullet, as quick captures write their extra lines.
                blocks[blocks.count - 1] = .bullet(text: text + "\n" + trimmed, indent: indent, ordinal: ordinal, line: at)
            } else {
                if paragraph.isEmpty { paragraphStart = index }
                paragraph.append(trimmed)
            }
            index += 1
        }
        flush()
        return blocks
    }

    /// The tasks in a text, outside code fences and frontmatter.
    static func tasks(_ text: String) -> [NoteTask] {
        blocks(text).compactMap {
            if case .task(let done, let text, _, let line) = $0 { return NoteTask(line: line, done: done, text: text) }
            return nil
        }
    }

    /// The note's title: its file name without `.md`.
    static func title(ofPath path: String) -> String {
        let name = path.split(separator: "/").last.map(String.init) ?? path
        return name.hasSuffix(".md") ? String(name.dropLast(3)) : name
    }
}
