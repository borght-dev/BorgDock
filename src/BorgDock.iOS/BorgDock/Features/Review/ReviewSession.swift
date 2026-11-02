import Foundation
import Observation

/// One pull request's walk: its files, which you've reviewed (kept per PR and head), and where you are.
@MainActor
@Observable
final class ReviewSession {
    let key: PrKey
    private(set) var detail: PrDetail?
    private(set) var files: PrFiles?
    private(set) var reviewed: Set<String> = []
    var fileIndex = 0
    private(set) var loadError: String?

    @ObservationIgnored private let storage: ReviewedFiles
    /// Parsed diffs by path, so swiping back and forth doesn't parse again.
    @ObservationIgnored private var parsed: [String: [DiffLine]] = [:]

    init(key: PrKey, storage: ReviewedFiles = ReviewedFiles()) {
        self.key = key
        self.storage = storage
    }

    var isLoaded: Bool { detail != nil && files != nil }
    var allFiles: [PrFile] { files?.files ?? [] }
    var currentFile: PrFile? { allFiles.indices.contains(fileIndex) ? allFiles[fileIndex] : nil }
    var left: Int { allFiles.filter { !reviewed.contains($0.path) }.count }
    var isDone: Bool { isLoaded && left == 0 }
    var isReReview: Bool { files.map(ReviewedFiles.isReReview) ?? false }
    var toReview: [PrFile] { allFiles.filter { !reviewed.contains($0.path) } }
    var progress: Double { allFiles.isEmpty ? 0 : Double(allFiles.count - left) / Double(allFiles.count) }

    func load(using store: FocusStore, startPath: String?) async {
        let cached = store.details[key.key]
        async let fetchedFiles = store.loadFiles(key)
        let loadedDetail = if let cached { cached } else { await store.loadDetail(key) }
        let loadedFiles = await fetchedFiles
        guard let loadedDetail, let loadedFiles else {
            loadError = "Couldn't load #\(key.number)."
            return
        }
        self.detail = loadedDetail
        self.files = loadedFiles
        reviewed = storage.initial(prKey: key.key, files: loadedFiles)
        if let startPath, let index = loadedFiles.files.firstIndex(where: { $0.path == startPath }) {
            fileIndex = index
        } else {
            fileIndex = firstUnreviewed(after: -1) ?? 0
        }
    }

    func lines(_ file: PrFile) -> [DiffLine] {
        if let cached = parsed[file.path] { return cached }
        let lines = file.patch.map(UnifiedDiff.parse) ?? []
        parsed[file.path] = lines
        return lines
    }

    func isReviewed(_ file: PrFile) -> Bool { reviewed.contains(file.path) }

    /// Marks the current file reviewed and moves to the next one still open. Returns true when that was the last.
    @discardableResult
    func markCurrentReviewed() -> Bool {
        guard let file = currentFile else { return false }
        reviewed.insert(file.path)
        save()
        if let next = firstUnreviewed(after: fileIndex) ?? firstUnreviewed(after: -1) { fileIndex = next }
        return left == 0
    }

    func unmark(_ file: PrFile) {
        reviewed.remove(file.path)
        save()
    }

    func jump(to path: String) {
        if let index = allFiles.firstIndex(where: { $0.path == path }) { fileIndex = index }
    }

    func firstUnreviewed(after index: Int) -> Int? {
        allFiles.indices.first { $0 > index && !reviewed.contains(allFiles[$0].path) }
    }

    private func save() {
        guard let files else { return }
        storage.save(reviewed, prKey: key.key, headSha: files.headSha)
    }
}
