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

    /// Which diff a re-review reads: what changed since your review, or the whole pull request.
    enum Scope: Hashable {
        case sinceReview, all
    }

    let key: PrKey
    private(set) var loadState = LoadState.loading
    /// Every file of the pull request, whatever the scope.
    private(set) var files: PrFiles?
    /// The diff between the commit you reviewed and the head; nil when there is none to read (BorgDock Review only).
    private(set) var sinceFiles: PrFiles?
    private(set) var scope = Scope.all
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
    /// Parsed diffs by scope and path, so moving back and forth doesn't parse again.
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
            var since: PrFiles?
            if store.app?.isReview == true {
                // Other people's threads show under their lines; a re-review reads what changed since yours.
                async let conversation: Void = store.readConversationQuietly(key)
                if ReviewedFiles.isReReview(snapshot.files) { since = try? await store.backend?.pullRequestFilesSinceReview(key) }
                await conversation
            }
            show(detail: snapshot.detail, files: snapshot.files, since: since, start: start)
        } catch is CancellationError {
            return
        } catch {
            loadState = .failed(ReviewLoadFailure.message(error, attempts: 2, approvalElsewhere: store.approvalElsewhere(than: key)))
        }
    }

    /// Shows a pull request already read: the walk starts on `start`, else on the first page you haven't reviewed.
    func show(detail: PrDetail, files: PrFiles, since: PrFiles? = nil, start: ReviewWalk.Position? = nil) {
        loadedDetail = detail
        self.files = files
        parsed = [:]
        sinceFiles = since.flatMap { $0.files.isEmpty ? nil : $0 }
        scope = sinceFiles == nil ? .all : .sinceReview
        walk = ReviewWalk(scopedFiles, steps: stepGroups)
        reviewed = storage.initial(prKey: key.key, files: files)
        opened = store?.openedFiles[key.key] ?? opened
        let first = start.flatMap { walk.contains($0) ? $0 : nil } ?? walk.start(reviewed)
        position = nil
        if let first { go(to: first) }
        loadState = .loaded
    }

    func lines(_ file: PrFile) -> [DiffLine] {
        let cacheKey = "\(scope):\(file.path)"
        if let cached = parsed[cacheKey] { return cached }
        let lines = file.patch.map(UnifiedDiff.parse) ?? []
        parsed[cacheKey] = lines
        return lines
    }

    /// BorgDock Review's setting for which kinds are one step; BorgDock reads tests and generated files as one each.
    private var stepGroups: Set<ReviewWalk.Group> {
        store?.app?.isReview == true ? ReviewPreferences.steps().groups : [.tests, .generated]
    }

    /// The files the walk reads in this scope.
    private var scopedFiles: [PrFile] {
        (scope == .sinceReview ? sinceFiles?.files : nil) ?? files?.files ?? []
    }

    /// Switches between what changed since your review and every file. The page stays when the other scope has it.
    func setScope(_ next: Scope) {
        guard next != scope, next == .all || sinceFiles != nil else { return }
        scope = next
        walk = ReviewWalk(scopedFiles, steps: stepGroups)
        let stay = position.flatMap { walk.contains($0) ? $0 : nil }
        position = nil
        if let target = stay ?? walk.start(reviewed) { go(to: target) }
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
