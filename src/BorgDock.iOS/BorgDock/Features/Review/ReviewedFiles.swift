import Foundation

/// Which files of a pull request you've marked reviewed, kept per PR and head commit so a new push starts over
/// (minus what the server says didn't change since your last review).
struct ReviewedFiles {
    private struct Entry: Codable {
        let headSha: String
        let paths: [String]
    }

    let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    private func storageKey(_ prKey: String) -> String { "borgdock.review.reviewed.\(prKey)" }

    /// The paths saved for exactly this head; nil when nothing was saved for it.
    func saved(prKey: String, headSha: String) -> Set<String>? {
        guard let data = defaults.data(forKey: storageKey(prKey)),
              let entry = try? JSONDecoder().decode(Entry.self, from: data),
              entry.headSha == headSha else { return nil }
        return Set(entry.paths)
    }

    /// One entry per PR: saving for a new head replaces the old one.
    func save(_ paths: Set<String>, prKey: String, headSha: String) {
        let entry = Entry(headSha: headSha, paths: paths.sorted())
        if let data = try? JSONEncoder().encode(entry) { defaults.set(data, forKey: storageKey(prKey)) }
    }

    func clear(prKey: String) {
        defaults.removeObject(forKey: storageKey(prKey))
    }

    /// Where a walk starts: what you saved for this head, else (on a re-review) every file the commits since your
    /// last review left alone, else nothing.
    func initial(prKey: String, files: PrFiles) -> Set<String> {
        if let saved = saved(prKey: prKey, headSha: files.headSha) {
            return saved.intersection(files.files.map(\.path))
        }
        return ReviewedFiles.carriedOver(files)
    }

    static func carriedOver(_ files: PrFiles) -> Set<String> {
        guard let reviewed = files.reviewedHeadSha, reviewed != files.headSha else { return [] }
        return Set(files.files.filter { !$0.changedSinceReview }.map(\.path))
    }

    /// A re-review: you reviewed an older head and some files changed since.
    static func isReReview(_ files: PrFiles) -> Bool {
        guard let reviewed = files.reviewedHeadSha, reviewed != files.headSha else { return false }
        return files.files.contains { $0.changedSinceReview }
    }
}
