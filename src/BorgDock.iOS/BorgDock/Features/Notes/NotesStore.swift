import Foundation
import Observation

/// The vault: notes in the folder you picked in Files, today's daily note, quick captures, live reference chips
/// and the workstreams next to the notes. Every write passes the text last read, so BorgDock never writes over
/// text you haven't seen (`Vault.write`).
@MainActor
@Observable
final class NotesStore {
    @ObservationIgnored weak var app: AppModel?

    private(set) var location: VaultLocation?
    private(set) var files: [NoteFile] = []
    /// The text last read of each note: the base every write is checked against.
    private(set) var texts: [String: String] = [:]
    /// Notes whose file changed under an unsaved edit: what the file holds now (nil: deleted).
    private(set) var conflicts: [String: String?] = [:]
    private(set) var resolved: [String: ResolvedRef] = [:]
    private(set) var workstreams: [Workstream] = []
    private(set) var isLoading = false
    private(set) var error: String?
    /// Whether the full text of every note has been read, for search and backlinks.
    private(set) var indexed = false

    @ObservationIgnored private var resolvedAt: [String: Date] = [:]
    @ObservationIgnored private let defaults: UserDefaults
    private static let contextKey = "notes.captureContext"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        #if DEBUG
        if let sample = SampleVault.installIfRequested() {
            location = VaultLocation(picked: sample)
            return
        }
        #endif
        location = VaultLocation.restore(defaults: defaults)
    }

    var vault: Vault? { location.map { Vault(root: $0.notes) } }

    // MARK: Folder

    func choose(_ url: URL) async {
        do {
            location = try VaultLocation.remember(url, defaults: defaults)
            texts = [:]
            conflicts = [:]
            indexed = false
            await reload()
        } catch {
            self.error = "Couldn't keep access to \(url.lastPathComponent): \(error.localizedDescription)"
        }
    }

    func forgetFolder() {
        VaultLocation.forget(defaults: defaults)
        location = nil
        files = []
        texts = [:]
        workstreams = []
        indexed = false
    }

    /// Lists the notes and reads the workstreams.
    func reload() async {
        guard let location, let vault else { return }
        isLoading = true
        defer { isLoading = false }
        async let listed = Task.detached { vault.list() }.value
        async let streams = Task.detached { WorkstreamFiles.load(from: location.workstreams) }.value
        files = await listed
        workstreams = await streams
        error = nil
    }

    /// Reads every note's text once, for full-text search and backlinks.
    func indexAll() async {
        guard let vault, !indexed else { return }
        if files.isEmpty { await reload() }
        let missing = files.map(\.path).filter { texts[$0] == nil }
        let read = await Task.detached { () -> [String: String] in
            var read: [String: String] = [:]
            for path in missing {
                if let text = try? vault.read(path) { read[path] = text }
            }
            return read
        }.value
        texts.merge(read) { cached, _ in cached }
        indexed = true
    }

    // MARK: Reading and writing

    /// The note's text, read fresh from disk. Nil when it doesn't exist.
    @discardableResult
    func open(_ path: String) async -> String? {
        guard let vault else { return nil }
        do {
            let text = try await Task.detached { try vault.read(path) }.value
            if let text, conflicts[path] == nil { texts[path] = text }
            return text
        } catch {
            self.error = error.localizedDescription
            return texts[path]
        }
    }

    /// Saves an edit made on top of the text last read. False when the file changed meanwhile; `conflicts`
    /// then holds what it says now and the edit isn't written.
    @discardableResult
    func save(_ path: String, text: String) async -> Bool {
        await write(path, text: text, base: texts[path])
    }

    /// After a conflict: write your edit over the version you've now seen.
    @discardableResult
    func keepMine(_ path: String, text: String) async -> Bool {
        guard let current = conflicts[path] else { return await save(path, text: text) }
        conflicts[path] = nil
        texts[path] = current
        return await write(path, text: text, base: current)
    }

    /// After a conflict: drop your edit and take what the file says.
    func takeDisk(_ path: String) {
        guard let current = conflicts.removeValue(forKey: path) else { return }
        texts[path] = current
    }

    private func write(_ path: String, text: String, base: String?) async -> Bool {
        guard let vault else { return false }
        do {
            let outcome = try await Task.detached { () throws -> VaultWrite in try vault.write(path, text: text, base: base) }.value
            switch outcome {
            case .written(let written):
                texts[path] = written
                conflicts[path] = nil
                touch(path)
                return true
            case .conflict(let current):
                conflicts[path] = current
                return false
            }
        } catch {
            app?.report(error)
            return false
        }
    }

    /// Ticks or unticks a task on the text read fresh from disk; only that line changes.
    func setTask(_ path: String, task: NoteTask, done: Bool) async {
        guard let vault else { return }
        do {
            let text = try await Task.detached {
                try vault.update(path) { current in
                    current.flatMap { NoteEdits.setTask($0, line: task.line, task: task.text, done: done) }
                }
            }.value
            if let text { texts[path] = text }
            touch(path)
        } catch {
            app?.report(error)
        }
    }

    /// A new note, empty, in `folder`. Returns its path.
    func createNote(title: String, folder: String = "") async -> String? {
        guard let vault else { return nil }
        let path = NoteEdits.uniquePath(folder: folder, title: title, taken: Set(files.map(\.path)))
        do {
            try await Task.detached { try vault.create(path, text: "") }.value
            texts[path] = ""
            touch(path)
            return path
        } catch {
            app?.report(error)
            return nil
        }
    }

    private func touch(_ path: String) {
        files.removeAll { $0.path == path }
        files.insert(NoteFile(path: path, modified: .now), at: 0)
    }

    // MARK: Daily note

    var todayPath: String { NoteEdits.dailyPath(.now) }

    /// Today's daily note, made when it doesn't exist yet, with the "Since yesterday" block from the server's
    /// digest. A note another machine already made is left as it is. Returns its path.
    @discardableResult
    func ensureDaily(_ date: Date = .now) async -> String? {
        guard let vault else { return nil }
        let path = NoteEdits.dailyPath(date)
        if await open(path) != nil { return path }
        if files.isEmpty { await reload() }
        let since = NoteEdits.digestSince(paths: files.map(\.path), today: date)
        let digest = try? await app?.api.digest(since: since)
        let template = await open("\(NoteEdits.templatesFolder)/Daily.md")
        let text = NoteEdits.dailyText(date: date, digest: digest, template: template)
        do {
            let written = try await Task.detached {
                try vault.update(path) { current in current == nil ? text : nil }
            }.value
            texts[path] = written
            touch(path)
            #if DEBUG
            await SampleVault.fillToday(self, path: path)
            #endif
            return path
        } catch {
            app?.report(error)
            return nil
        }
    }

    // MARK: Quick capture

    /// The pull request or work item you last opened, while it's fresh.
    var captureContext: CaptureContext? {
        guard let data = defaults.data(forKey: Self.contextKey),
              let context = try? JSONDecoder().decode(CaptureContext.self, from: data),
              context.isFresh()
        else { return nil }
        return context
    }

    func remember(_ context: CaptureContext) {
        if let data = try? JSONEncoder().encode(context) { defaults.set(data, forKey: Self.contextKey) }
    }

    /// Remembers the pull request or item a route shows, for the next quick note.
    func remember(route: Route?) {
        switch route {
        case .pullRequest(let key):
            remember(CaptureContext(kind: .pr, key: key.key, title: key.key, at: .now))
        case .workItem(let item):
            let title = item.prefill?.title ?? app?.itemOverview(item.id)?.item.title ?? "AB#\(item.id)"
            remember(CaptureContext(kind: .item, key: String(item.id), title: title, at: .now))
        default:
            break
        }
    }

    /// Appends a quick note to today's note under `## Captured`. True when it was written.
    func capture(_ text: String, context: CaptureContext?) async -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let vault, let path = await ensureDaily() else { return false }
        let lines = NoteEdits.captureLines(trimmed, at: .now, context: context)
        do {
            let written = try await Task.detached {
                try vault.update(path) { current in NoteEdits.withCapture(current ?? "", lines: lines) }
            }.value
            if conflicts[path] == nil { texts[path] = written }
            touch(path)
            return true
        } catch {
            app?.report(error)
            return false
        }
    }

    // MARK: References

    /// Live state for the refs, read at most once a minute each.
    func resolve(_ refs: [NoteRef]) async {
        await resolve(keys: refs.compactMap(\.resolveKey))
    }

    func resolve(keys: [String]) async {
        guard let api = app?.api, app?.isSignedIn == true else { return }
        let now = Date.now
        let wanted = Array(Set(keys.filter { resolvedAt[$0].map { now.timeIntervalSince($0) > 60 } ?? true }))
        guard !wanted.isEmpty else { return }
        for key in wanted { resolvedAt[key] = now }
        do {
            let answer = try await api.resolveRefs(wanted)
            resolved.merge(answer) { _, fresh in fresh }
        } catch {
            for key in wanted { resolvedAt[key] = nil }
        }
    }

    // MARK: Search and links

    struct NoteHit: Hashable, Identifiable {
        let file: NoteFile
        /// The matching line, trimmed around the match: "…# Checkout The timeout fix in #3712 waits…".
        let snippet: String?
        let titleMatch: Bool
        var id: String { file.path }
    }

    /// Notes whose title or text holds every word of the query; title matches first.
    func search(_ query: String) -> [NoteHit] {
        let words = query.lowercased().split(whereSeparator: \.isWhitespace).map(String.init)
        guard !words.isEmpty else { return [] }
        var hits: [NoteHit] = []
        for file in files {
            let title = file.title.lowercased()
            let text = texts[file.path] ?? ""
            let haystack = title + "\n" + text.lowercased()
            guard words.allSatisfy(haystack.contains) else { continue }
            let titleMatch = words.allSatisfy(title.contains)
            hits.append(NoteHit(file: file, snippet: titleMatch ? nil : Self.snippet(text, word: words[0]), titleMatch: titleMatch))
        }
        return hits.sorted { $0.titleMatch && !$1.titleMatch }
    }

    static func snippet(_ text: String, word: String) -> String? {
        let flat = text.replacingOccurrences(of: "\n", with: " ")
        guard let range = flat.range(of: word, options: .caseInsensitive) else { return nil }
        let start = flat.index(range.lowerBound, offsetBy: -16, limitedBy: flat.startIndex) ?? flat.startIndex
        let end = flat.index(range.upperBound, offsetBy: 34, limitedBy: flat.endIndex) ?? flat.endIndex
        return (start > flat.startIndex ? "…" : "") + flat[start..<end].trimmingCharacters(in: .whitespaces) + (end < flat.endIndex ? "…" : "")
    }

    /// The note a `[[link]]` points at: by title, then by path.
    func path(forLink target: String) -> String? {
        let wanted = target.lowercased()
        return files.first { $0.title.lowercased() == wanted }?.path
            ?? files.first { $0.path.lowercased() == wanted + ".md" || $0.path.lowercased() == wanted }?.path
    }

    /// How many notes link to `title`.
    func backlinks(to title: String) -> Int {
        let wanted = title.lowercased()
        return texts.values.filter { NoteText.wikilinkTargets(in: $0).contains(wanted) }.count
    }

    func workstream(_ id: String) -> Workstream? { workstreams.first { $0.id == id } }

    /// Notes that link to a workstream (`borgdock://workstreams/<id>`).
    func notes(mentioningWorkstream id: String) -> [NoteFile] {
        files.filter { texts[$0.path]?.contains("borgdock://workstreams/\(id)") == true }
    }
}
