import Foundation
import Observation

/// One pull request in Quick Review: its brief, its walk, which files you've reviewed (kept per PR and head) and
/// which you've opened. Where you are is a `ReviewWalk.Position`, a file path or a step, never an index.
@MainActor
@Observable
final class ReviewSession {
    enum Stage {
        /// The pull request before its files: description, proof, checks, what changed.
        case brief
        case walk
    }

    enum LoadState: Equatable {
        case loading
        case loaded
        /// After the automatic retry; the text says why.
        case failed(String)
    }

    let key: PrKey
    private(set) var loadState = LoadState.loading
    private(set) var files: PrFiles?
    private(set) var walk = ReviewWalk([])
    private(set) var reviewed: Set<String> = []
    /// Paths whose page you've seen in this review: a green dot on a step's rows.
    private(set) var opened: Set<String> = []
    private(set) var position: ReviewWalk.Position?
    /// Whether the last move went forward, so the next page slides in from the right side.
    private(set) var movedForward = true
    var stage = Stage.walk
    /// A decided pull request opened again: its files instead of the decision.
    var revisiting = false

    @ObservationIgnored private weak var store: FocusStore?
    @ObservationIgnored private var loadedDetail: PrDetail?
    @ObservationIgnored private let storage: ReviewedFiles
    /// Parsed diffs by path, so moving back and forth doesn't parse again.
    @ObservationIgnored private var parsed: [String: [DiffLine]] = [:]

    init(key: PrKey, storage: ReviewedFiles = ReviewedFiles()) {
        self.key = key
        self.storage = storage
    }

    /// The newest detail: Focus reads it again after a decision posts, so the page never shows the state from before it.
    var detail: PrDetail? { store?.details[key.key] ?? loadedDetail }
    var isLoaded: Bool { loadState == .loaded }
    var left: Int { walk.left(reviewed) }
    var isDone: Bool { isLoaded && left == 0 }
    var isReReview: Bool { files.map(ReviewedFiles.isReReview) ?? false }
    var currentFile: PrFile? { position?.path.flatMap(walk.file) }

    func load(using store: FocusStore, start: ReviewWalk.Position?) async {
        self.store = store
        loadState = .loading
        do {
            let snapshot = try await store.reviewSnapshot(key)
            show(detail: snapshot.detail, files: snapshot.files, start: start)
        } catch is CancellationError {
            return
        } catch {
            loadState = .failed(ReviewLoadFailure.message(error, attempts: 2, approvalElsewhere: store.approvalElsewhere(than: key)))
        }
    }

    /// Shows a pull request already read: the walk starts on `start`, else on the first page you haven't reviewed.
    func show(detail: PrDetail, files: PrFiles, start: ReviewWalk.Position? = nil) {
        loadedDetail = detail
        self.files = files
        walk = ReviewWalk(files.files)
        reviewed = storage.initial(prKey: key.key, files: files)
        opened = store?.openedFiles[key.key] ?? opened
        let first = start.flatMap { walk.contains($0) ? $0 : nil } ?? walk.start(reviewed)
        position = nil
        if let first { go(to: first) }
        loadState = .loaded
    }

    func lines(_ file: PrFile) -> [DiffLine] {
        if let cached = parsed[file.path] { return cached }
        let lines = file.patch.map(UnifiedDiff.parse) ?? []
        parsed[file.path] = lines
        return lines
    }

    func isReviewed(_ position: ReviewWalk.Position) -> Bool { walk.isReviewed(position, in: reviewed) }

    // MARK: - Moving

    func go(to target: ReviewWalk.Position) {
        guard walk.contains(target), target != position else { return }
        movedForward = position.map { walk.isForward(from: $0, to: target) } ?? true
        position = target
        if let path = target.path {
            opened.insert(path)
            store?.openedFiles[key.key, default: []].insert(path)
        }
    }

    func open(_ path: String) { go(to: .file(path)) }

    var canGoBack: Bool { position.flatMap(walk.previous(before:)) != nil }
    var canGoForward: Bool { position.flatMap(walk.next(after:)) != nil }

    func goBack() {
        if let previous = position.flatMap(walk.previous(before:)) { go(to: previous) }
    }

    func goForward() {
        if let next = position.flatMap(walk.next(after:)) { go(to: next) }
    }

    /// Next file to review: the first page after this one you haven't reviewed.
    func goToNextUnreviewed() {
        guard let position, let next = walk.nextUnreviewed(after: position, in: reviewed) else { return }
        go(to: next)
    }

    // MARK: - Reviewing

    /// Marks this page reviewed (a step: all its files) and opens the next page still to review. True when that
    /// was the last.
    @discardableResult
    func markCurrentReviewed() -> Bool {
        guard let position else { return false }
        reviewed.formUnion(walk.paths(markedBy: position))
        save()
        if let next = walk.nextUnreviewed(after: position, in: reviewed) { go(to: next) }
        return left == 0
    }

    func unmarkCurrent() {
        guard let position else { return }
        reviewed.subtract(walk.paths(markedBy: position))
        save()
    }

    private func save() {
        guard let files else { return }
        storage.save(reviewed, prKey: key.key, headSha: files.headSha)
    }
}
