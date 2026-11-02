import Foundation

/// Edits BorgDock makes to a note on your behalf, the same rules as the desktop's `services/notes/text-edits.ts`,
/// `daily.ts`, `capture.ts` and `paths.ts`. Pure: each keeps the rest of the text as it was, line endings included.
enum NoteEdits {
    static let dailyFolder = "Daily"
    static let templatesFolder = "Templates"
    static let capturedHeading = "Captured"
    /// The digest looks back at most a week.
    static let digestLookback: TimeInterval = 7 * 24 * 3600

    // MARK: Paths

    /// `2026-10-30` in the given calendar's time zone.
    static func dayKey(_ date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    static func dailyPath(_ date: Date, calendar: Calendar = .current) -> String {
        "\(dailyFolder)/\(dayKey(date, calendar: calendar)).md"
    }

    static func isDailyPath(_ path: String) -> Bool {
        path.wholeMatch(of: /Daily\/\d{4}-\d{2}-\d{2}\.md/) != nil
    }

    /// "Friday 30 October", as the desktop titles a daily note.
    static func dailyTitle(_ date: Date, calendar: Calendar = .current) -> String {
        var style = Date.FormatStyle(date: .omitted, time: .omitted, locale: Locale(identifier: "en_GB"), calendar: calendar, timeZone: calendar.timeZone)
        style = style.weekday(.wide).day(.defaultDigits).month(.wide)
        let text = date.formatted(style)
        return text.replacingOccurrences(of: ",", with: "")
    }

    /// A title as a file name: characters Windows and Obsidian refuse become a space, nothing is left empty.
    static func safeTitle(_ title: String) -> String {
        let refused = CharacterSet(charactersIn: "\\/:*?\"<>|#^[]")
        var cleaned = String(title.unicodeScalars.map { refused.contains($0) ? " " : Character($0) })
        cleaned = cleaned.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        while cleaned.hasPrefix(".") { cleaned.removeFirst() }
        cleaned = String(cleaned.prefix(120)).trimmingCharacters(in: .whitespaces)
        return cleaned.isEmpty ? "Untitled" : cleaned
    }

    /// `Untitled.md`, numbered (`Untitled 2.md`) until no path in `taken` has it.
    static func uniquePath(folder: String, title: String, taken: Set<String>) -> String {
        let lower = Set(taken.map { $0.lowercased() })
        let base = safeTitle(title)
        func path(_ name: String) -> String { folder.isEmpty ? "\(name).md" : "\(folder)/\(name).md" }
        var candidate = path(base)
        var number = 2
        while lower.contains(candidate.lowercased()) {
            candidate = path("\(base) \(number)")
            number += 1
        }
        return candidate
    }

    // MARK: Markers

    static func markerStart(_ id: String) -> String { "<!-- borgdock:\(id) -->" }
    static func markerEnd(_ id: String) -> String { "<!-- /borgdock:\(id) -->" }

    static func hasMarkerBlock(_ text: String, id: String) -> Bool { text.contains(markerStart(id)) }

    /// `body` wrapped in BorgDock's markers for block `id`.
    static func markerBlock(_ id: String, _ body: [String]) -> [String] {
        [markerStart(id)] + body + [markerEnd(id)]
    }

    // MARK: Daily note

    /// When the digest starts: the start of the previous daily note's day, at most a week back; a day back when
    /// there is no earlier daily note.
    static func digestSince(paths: some Sequence<String>, today: Date, calendar: Calendar = .current) -> Date {
        let todayKey = dayKey(today, calendar: calendar)
        let previous = paths.filter(isDailyPath).map(NoteText.title(ofPath:)).filter { $0 < todayKey }.max()
        guard let previous else { return today.addingTimeInterval(-24 * 3600) }
        let parts = previous.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, let start = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else {
            return today.addingTimeInterval(-24 * 3600)
        }
        return max(start, today.addingTimeInterval(-digestLookback))
    }

    /// A digest line as a bullet, with its first ref in front when the text doesn't name it, so its chip draws.
    static func digestLine(_ line: Digest.Line) -> String {
        let text = line.text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let ref = line.refs.first(where: { $0.contains("#") && !$0.contains(":") }), !text.contains(ref) {
            return "- \(ref) · \(text)"
        }
        return "- \(text)"
    }

    /// `## Since yesterday` and the digest between markers; nothing when nothing happened.
    static func sinceBlock(_ digest: Digest?, day: String) -> [String] {
        guard let digest, !digest.lines.isEmpty else { return [] }
        return ["## Since yesterday"] + markerBlock("since \(day)", digest.lines.map(digestLine)) + [""]
    }

    /// What a new daily note starts with: the template when the vault has one, else the date as a heading, then
    /// the "Since yesterday" block.
    static func dailyText(date: Date, digest: Digest?, template: String?, calendar: Calendar = .current) -> String {
        let title = dailyTitle(date, calendar: calendar)
        let day = dayKey(date, calendar: calendar)
        var head = ["# \(title)", ""]
        if let template {
            let time = date.formatted(Date.FormatStyle(date: .omitted, time: .shortened, locale: Locale(identifier: "en_GB"), calendar: calendar, timeZone: calendar.timeZone))
            let filled = fillTemplate(template, date: day, time: time, title: title)
            head = filled.trimmingCharacters(in: .whitespacesAndNewlines).components(separatedBy: "\n")
        }
        var text = (head + [""] + sinceBlock(digest, day: day)).joined(separator: "\n")
        while text.contains("\n\n\n") { text = text.replacingOccurrences(of: "\n\n\n", with: "\n\n") }
        return text
    }

    static func fillTemplate(_ template: String, date: String, time: String, title: String) -> String {
        template.replacing(/\{\{\s*(date|time|title)\s*\}\}/) { match in
            switch match.output.1 {
            case "date": date
            case "time": time
            default: title
            }
        }
    }

    // MARK: Edits

    private static func newline(of text: String) -> String { text.contains("\r\n") ? "\r\n" : "\n" }

    private static func lines(_ text: String) -> [String] {
        text.isEmpty ? [] : text.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
    }

    /// `added` appended at the end of the section under `heading` (any level); the section is added at the end of
    /// the note when it is missing.
    static func appendUnderHeading(_ text: String, heading: String, lines added: [String]) -> String {
        let nl = newline(of: text)
        var all = lines(text)
        let wanted = heading.trimmingCharacters(in: .whitespaces).lowercased()
        let start = all.firstIndex { line in
            guard let match = line.firstMatch(of: /^(#{1,6}) +(.+?)\s*$/) else { return false }
            return match.output.2.lowercased() == wanted
        }
        guard let start else {
            while let last = all.last, last.trimmingCharacters(in: .whitespaces).isEmpty { all.removeLast() }
            let block = (all.isEmpty ? [] : [""]) + ["## \(heading)"] + added
            return (all + block + [""]).joined(separator: nl)
        }
        let level = all[start].prefix { $0 == "#" }.count
        var end = all.count
        for index in (start + 1)..<all.count {
            if let match = all[index].firstMatch(of: /^(#{1,6})\x20/), match.output.1.count <= level {
                end = index
                break
            }
        }
        var insertAt = end
        while insertAt > start + 1, all[insertAt - 1].trimmingCharacters(in: .whitespaces).isEmpty { insertAt -= 1 }
        let after = Array(all[insertAt...])
        let spacer = end < all.count && after.first?.trimmingCharacters(in: .whitespaces) != "" ? [""] : []
        return (Array(all[..<insertAt]) + added + spacer + after).joined(separator: nl)
    }

    /// The task reading `task` set to `done`: the one on `line` when it is still there, else the first task with
    /// that text, since lines move when the file changes. Nil when there is no such task or it already is.
    static func setTask(_ text: String, line: Int, task: String, done: Bool) -> String? {
        let nl = newline(of: text)
        var all = lines(text)
        let candidates = NoteText.tasks(text).filter { $0.text == task }
        guard let at = (candidates.first { $0.line == line } ?? candidates.first)?.line, all.indices.contains(at),
              let match = all[at].firstMatch(of: /^(\s*[-*+] \[)([ xX])(\] )(.*)$/)
        else { return nil }
        let next = "\(match.output.1)\(done ? "x" : " ")\(match.output.3)\(match.output.4)"
        guard next != all[at] else { return nil }
        all[at] = next
        return all.joined(separator: nl)
    }

    /// A task appended at the end of the note.
    static func appendTask(_ text: String, task: String) -> String {
        let nl = newline(of: text)
        var all = lines(text)
        while let last = all.last, last.trimmingCharacters(in: .whitespaces).isEmpty { all.removeLast() }
        return (all + ["- [ ] \(task)", ""]).joined(separator: nl)
    }

    // MARK: Quick capture

    /// The capture as note lines: the first line timed and referenced, the rest indented under it.
    static func captureLines(_ text: String, at date: Date, context: CaptureContext?, calendar: Calendar = .current) -> [String] {
        let parts = text.trimmingCharacters(in: .whitespacesAndNewlines).components(separatedBy: "\n")
        let time = date.formatted(Date.FormatStyle(date: .omitted, time: .shortened, locale: Locale(identifier: "en_GB"), calendar: calendar, timeZone: calendar.timeZone))
        let ref = context.map { " · \($0.ref)" } ?? ""
        let first = parts.first?.trimmingCharacters(in: .whitespaces) ?? ""
        return ["- \(time) \(first)\(ref)"] + parts.dropFirst().map { "  \($0)" }
    }

    /// Today's note with the capture appended under `## Captured`.
    static func withCapture(_ note: String, lines: [String]) -> String {
        appendUnderHeading(note, heading: capturedHeading, lines: lines)
    }
}

/// What a quick note links to: the pull request or work item you last opened, for two hours.
struct CaptureContext: Codable, Hashable, Sendable {
    enum Kind: String, Codable, Sendable { case pr, item }

    let kind: Kind
    /// `owner/repo#12` for a pull request, the id for an item.
    let key: String
    let title: String
    let at: Date

    static let freshFor: TimeInterval = 2 * 3600

    /// How the note writes it: `owner/repo#12` or `AB#123`.
    var ref: String { kind == .pr ? key : "AB#\(key)" }

    /// "shop#3712", for the chip.
    var shortRef: String {
        guard kind == .pr, let key = PrKey(key: key) else { return ref }
        return "\(key.repo)#\(key.number)"
    }

    func isFresh(now: Date = .now) -> Bool { now.timeIntervalSince(at) < Self.freshFor }
}
