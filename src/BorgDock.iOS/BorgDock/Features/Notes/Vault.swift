import Foundation

/// A note file in the vault.
struct NoteFile: Hashable, Sendable, Identifiable {
    /// Relative to the vault, with `/`: "Daily/2026-10-30.md".
    let path: String
    let modified: Date
    /// Not downloaded yet (an iCloud placeholder); reading it downloads it.
    var isPlaceholder = false

    var id: String { path }
    var title: String { NoteText.title(ofPath: path) }
    var folder: String { path.contains("/") ? String(path[..<path.lastIndex(of: "/")!]) : "" }
}

/// The result of a write that must not overwrite text you haven't read.
enum VaultWrite: Equatable, Sendable {
    case written(String)
    /// The file changed since `base` was read; this is what it holds now (nil: it was deleted).
    case conflict(current: String?)
}

enum VaultError: LocalizedError, Equatable {
    case outside(String)
    case notMarkdown(String)
    case exists(String)
    case unreadable(String)

    var errorDescription: String? {
        switch self {
        case .outside(let path): "\(path) is outside the vault."
        case .notMarkdown(let path): "\(path) isn't a Markdown note."
        case .exists(let path): "\(path) already exists."
        case .unreadable(let path): "Couldn't read \(path)."
        }
    }
}

/// The vault on disk: the same Markdown files the desktop and Obsidian open. Every write passes `base`, the text
/// last read, and is refused when the file holds something else now. Synchronous; call it off the main actor.
struct Vault: Sendable {
    let root: URL

    // MARK: Paths

    /// The URL of a vault path. Refuses anything outside the vault, hidden folders and non-Markdown files, like
    /// the desktop's `notes::resolve`.
    func url(for path: String) throws -> URL {
        let parts = path.split(separator: "/", omittingEmptySubsequences: true)
        guard !parts.isEmpty, !parts.contains(where: { $0 == ".." || $0.hasPrefix(".") }) else { throw VaultError.outside(path) }
        guard path.lowercased().hasSuffix(".md") else { throw VaultError.notMarkdown(path) }
        return parts.reduce(root) { $0.appendingPathComponent(String($1)) }
    }

    // MARK: Reading

    /// Every note, newest first. Hidden folders and BorgDock's trash are left out.
    func list() -> [NoteFile] {
        let keys: [URLResourceKey] = [.contentModificationDateKey, .isDirectoryKey]
        guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys, options: []) else { return [] }
        let rootPath = root.standardizedFileURL.path
        var files: [NoteFile] = []
        for case let url as URL in enumerator {
            let name = url.lastPathComponent
            let values = try? url.resourceValues(forKeys: Set(keys))
            if values?.isDirectory == true {
                if name.hasPrefix(".") || name == ".trash" { enumerator.skipDescendants() }
                continue
            }
            var relative = String(url.standardizedFileURL.path.dropFirst(rootPath.count))
            while relative.hasPrefix("/") { relative.removeFirst() }
            var placeholder = false
            // iCloud keeps files it hasn't downloaded as ".Name.md.icloud".
            if name.hasPrefix("."), name.hasSuffix(".md.icloud") {
                let real = String(name.dropFirst().dropLast(".icloud".count))
                relative = String(relative.dropLast(name.count)) + real
                placeholder = true
            } else if name.hasPrefix(".") || !name.lowercased().hasSuffix(".md") {
                continue
            }
            files.append(NoteFile(path: relative, modified: values?.contentModificationDate ?? .distantPast, isPlaceholder: placeholder))
        }
        return files.sorted { $0.modified > $1.modified }
    }

    /// The note's text; nil when there is no such file.
    func read(_ path: String) throws -> String? {
        let url = try url(for: path)
        var result: Result<String?, Error> = .success(nil)
        var coordinationError: NSError?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { url in
            guard FileManager.default.fileExists(atPath: url.path) else {
                result = .success(nil)
                return
            }
            result = Result { try String(contentsOf: url, encoding: .utf8) }
        }
        if let coordinationError {
            if coordinationError.domain == NSCocoaErrorDomain, coordinationError.code == NSFileReadNoSuchFileError { return nil }
            throw coordinationError
        }
        return try result.get()
    }

    // MARK: Writing

    /// Writes `text` when the file still holds `base` (nil: it must not exist yet). Never writes over text you
    /// haven't read: otherwise answers `.conflict` with what the file holds now.
    func write(_ path: String, text: String, base: String?) throws -> VaultWrite {
        let url = try url(for: path)
        var outcome: Result<VaultWrite, Error> = .success(.written(text))
        var coordinationError: NSError?
        NSFileCoordinator().coordinate(writingItemAt: url, options: [], error: &coordinationError) { url in
            outcome = Result {
                let exists = FileManager.default.fileExists(atPath: url.path)
                let current = exists ? try String(contentsOf: url, encoding: .utf8) : nil
                guard current == base else { return .conflict(current: current) }
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try Data(text.utf8).write(to: url, options: .atomic)
                return .written(text)
            }
        }
        if let coordinationError { throw coordinationError }
        return try outcome.get()
    }

    /// Reads the file fresh, applies `change`, and writes the result over what it read. `change` gets nil for a
    /// missing file and returns nil to leave the file alone. Returns the text the file holds afterwards.
    @discardableResult
    func update(_ path: String, _ change: (String?) -> String?) throws -> String? {
        for _ in 0..<3 {
            let current = try read(path)
            guard let next = change(current) else { return current }
            if case .written(let text) = try write(path, text: next, base: current) { return text }
        }
        throw VaultError.unreadable(path)
    }

    /// A new note; refuses to replace one.
    func create(_ path: String, text: String) throws {
        guard case .written = try write(path, text: text, base: nil) else { throw VaultError.exists(path) }
    }
}

/// Where the vault lives: a folder picked in Files, remembered as a security-scoped bookmark. The picked folder is
/// either the sync folder that holds `BorgDock Notes` and `BorgDock Workstreams`, or the notes folder itself.
struct VaultLocation: Equatable, Sendable {
    static let notesFolderName = "BorgDock Notes"
    static let workstreamsFolderName = "BorgDock Workstreams"

    let picked: URL

    var notes: URL {
        let inside = picked.appendingPathComponent(Self.notesFolderName, isDirectory: true)
        return Self.isDirectory(inside) ? inside : picked
    }

    /// `BorgDock Workstreams` inside the picked folder, else next to the notes folder.
    var workstreams: URL {
        let inside = picked.appendingPathComponent(Self.workstreamsFolderName, isDirectory: true)
        if Self.isDirectory(inside) { return inside }
        return notes.deletingLastPathComponent().appendingPathComponent(Self.workstreamsFolderName, isDirectory: true)
    }

    var displayName: String { picked.lastPathComponent }

    private static func isDirectory(_ url: URL) -> Bool {
        var isDirectory: ObjCBool = false
        return FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) && isDirectory.boolValue
    }

    // MARK: Bookmark

    private static let bookmarkKey = "notes.vaultBookmark"

    /// The remembered folder, with access started. Nil when none was picked or it can't be reached any more.
    static func restore(defaults: UserDefaults = .standard) -> VaultLocation? {
        guard let data = defaults.data(forKey: bookmarkKey) else { return nil }
        var stale = false
        guard let url = try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) else { return nil }
        _ = url.startAccessingSecurityScopedResource()
        if stale, let fresh = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
            defaults.set(fresh, forKey: bookmarkKey)
        }
        return VaultLocation(picked: url)
    }

    /// Remembers a folder from the Files picker. Access stays open for as long as the app runs.
    static func remember(_ url: URL, defaults: UserDefaults = .standard) throws -> VaultLocation {
        _ = url.startAccessingSecurityScopedResource()
        let data = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
        defaults.set(data, forKey: bookmarkKey)
        return VaultLocation(picked: url)
    }

    static func forget(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: bookmarkKey)
    }
}
