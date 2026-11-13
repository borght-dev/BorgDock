import SwiftUI

/// Quick Review: one pull request after another. A PR you haven't opened yet starts on its brief; from its own page,
/// Start review goes straight to the first file you haven't reviewed. Approve stays locked until every file and step
/// is reviewed, an approval waits out its Undo before GitHub hears about it, and going back to a decided PR shows the
/// decision. Skip (on the brief, in the walk's lock menu) moves on without a decision, like the desktop's Review later.
/// Mockup: design/ios-flow/mockups.html, sections 05 and 06.
struct QuickReviewView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let keys: [PrKey]

    @State private var queue: [PrKey] = []
    @State private var position = 0
    @State private var sessions: [String: ReviewSession] = [:]
    @State private var deciding = false
    @State private var showsFiles = false
    @State private var lineDraft: LineDraftTarget?

    private var key: PrKey? { queue.indices.contains(position) ? queue[position] : nil }
    private var session: ReviewSession? { key.flatMap { sessions[$0.key] } }
    private var nextKey: PrKey? { queue.indices.contains(position + 1) ? queue[position + 1] : nil }

    private enum Page {
        case loading(failure: String?)
        case brief, walk, decided(ReviewDecisionRecord), finished
    }

    private var page: Page {
        guard let key, let session else { return queue.isEmpty ? .loading(failure: nil) : .finished }
        switch session.loadState {
        case .loading: return .loading(failure: nil)
        case .failed(let message): return .loading(failure: message)
        case .loaded:
            if let decision = app.focus.reviewDecisions[key.key], !session.revisiting { return .decided(decision) }
            return session.stage == .brief ? .brief : .walk
        }
    }

    var body: some View {
        NavigationStack {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(BD.bg)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { toolbar }
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    VStack(spacing: 10) {
                        ApprovalToast()
                        bottomBar
                    }
                    .animation(.snappy, value: app.focus.hold.current)
                }
        }
        .tint(BD.text)
        .sheet(isPresented: $deciding) {
            if let key, let session { DecideSheet(session: session, draft: draftBinding(key), onDecided: advance, onJump: jump) }
        }
        .sheet(item: $lineDraft) { target in
            if let key { LineDraftSheet(target: target, draft: draftBinding(key)) }
        }
        .sheet(isPresented: $showsFiles) {
            if let session { ReviewFilesSheet(session: session) }
        }
        .onAppear {
            guard queue.isEmpty else { return }
            queue = keys
            #if DEBUG
            if let start = app.focus.debugReviewPosition { position = start }
            app.focus.debugReviewPosition = nil
            #endif
            prepare()
        }
        .onChange(of: position) { prepare() }
        .onChange(of: app.focus.reopenDecision) { reopenIfAsked() }
    }

    @ViewBuilder
    private var content: some View {
        switch page {
        case .loading(let failure):
            if let key {
                ReviewLoadPage(summary: app.focus.summary(key), key: key, failure: failure, nextNumber: nextKey?.number,
                               onSkip: { position += 1 }, onRetry: { load(key) })
            } else {
                ProgressView()
            }
        case .brief:
            if let session { ReviewBrief(session: session) }
        case .walk:
            if let key, let session {
                WalkPager(session: session) { position in
                    switch position {
                    case .file(let path):
                        if let file = session.walk.file(path) {
                            FilePage(session: session, file: file, draft: app.focus.reviewDrafts[key.key] ?? ReviewDraft()) { lineDraft = $0 }
                        }
                    case .step(let group):
                        StepPage(session: session, group: group)
                    }
                }
                .ignoresSafeArea(edges: .bottom)
            }
        case .decided(let decision):
            if let session { ReviewDecisionPage(session: session, decision: decision) }
        case .finished:
            finished
        }
    }

    // MARK: - Flow

    private func prepare() {
        guard let key else { return }
        if let nextKey { app.focus.prefetchReview(nextKey) }
        guard sessions[key.key] == nil else {
            reopenIfAsked()
            return
        }
        let session = ReviewSession(key: key)
        session.stage = startsOnBrief(key) ? .brief : .walk
        sessions[key.key] = session
        load(key)
    }

    private func load(_ key: PrKey) {
        guard let session = sessions[key.key] else { return }
        let start = startPosition(key)
        Task {
            await session.load(using: app.focus, start: start)
            if session.isLoaded, session.stage == .walk { app.focus.markReviewOpened(key) }
            #if DEBUG
            if app.focus.debugShowReviewFiles {
                app.focus.debugShowReviewFiles = false
                showsFiles = true
            }
            #endif
            reopenIfAsked()
        }
    }

    /// The brief is for a pull request you haven't opened yet: not one whose page you came from, nor one you've
    /// walked before, nor a file picked on its page.
    private func startsOnBrief(_ key: PrKey) -> Bool {
        if app.focus.reviewStartPath[key.key] != nil || app.focus.openedReviews.contains(key.key) { return false }
        #if DEBUG
        if app.focus.debugReviewStart[key.key] != nil { return false }
        #endif
        return !(position == 0 && app.router.visiblePullRequest == key)
    }

    private func startPosition(_ key: PrKey) -> ReviewWalk.Position? {
        #if DEBUG
        if let start = app.focus.debugReviewStart.removeValue(forKey: key.key) { return start }
        #endif
        return app.focus.reviewStartPath.removeValue(forKey: key.key).map { .file($0) }
    }

    private func start() {
        guard let key, let session else { return }
        app.focus.markReviewOpened(key)
        withAnimation(.snappy) { session.stage = .walk }
    }

    /// An undone approval comes back to its decision with the draft intact.
    private func reopenIfAsked() {
        guard let wanted = app.focus.reopenDecision, let index = queue.firstIndex(where: { $0.key == wanted }) else { return }
        app.focus.reopenDecision = nil
        if position != index { position = index }
        guard let session = sessions[wanted] else { return }
        session.stage = .walk
        session.revisiting = false
        if session.isLoaded { deciding = true }
    }

    private func advance() {
        deciding = false
        position += 1
    }

    private func jump(_ path: String) {
        deciding = false
        session?.revisiting = true
        session?.stage = .walk
        session?.open(path)
    }

    private func markReviewed() {
        guard let session else { return }
        if session.markCurrentReviewed() { deciding = true }
    }

    private func draftBinding(_ key: PrKey) -> Binding<ReviewDraft> {
        Binding(get: { app.focus.reviewDrafts[key.key] ?? ReviewDraft() }, set: { app.focus.reviewDrafts[key.key] = $0 })
    }

    // MARK: - Chrome

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button { dismiss() } label: { Image(systemName: "xmark") }.accessibilityLabel("Close")
        }
        ToolbarItem(placement: .principal) { title }
        if case .walk = page, let session {
            ToolbarItem(placement: .topBarTrailing) { lockButton(session) }
        } else if case .brief = page {
            ToolbarItem(placement: .topBarTrailing) { skipButton }
        }
    }

    private var skipTitle: String { nextKey.map { "Skip to #\($0.number)" } ?? "Skip this pull request" }

    private var skipButton: some View {
        Button(action: advance) {
            Text("Skip")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(BD.text2)
                .padding(.horizontal, 4)
        }
        .accessibilityLabel(skipTitle)
        .accessibilityIdentifier("review-skip")
    }

    @ViewBuilder
    private var title: some View {
        if case .walk = page, let session {
            Button { showsFiles = true } label: { WalkTitle(session: session) }.buttonStyle(.plain)
        } else if let key {
            VStack(spacing: 1) {
                Text(queue.count > 1 ? "Review · \(position + 1) of \(queue.count)" : "Review #\(key.number)")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(BD.text)
                if let nextKey {
                    Text(verbatim: "Up next: #\(nextKey.number)").font(.system(size: 12)).foregroundStyle(BD.text2)
                }
            }
        }
    }

    @ViewBuilder
    private func lockButton(_ session: ReviewSession) -> some View {
        if session.isDone {
            Button { deciding = true } label: {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark")
                    Text("Done")
                }
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(BD.green)
                .padding(.horizontal, 4)
            }
            .accessibilityLabel("Done, decide")
        } else {
            Menu {
                Button("Next file to review", systemImage: "arrow.right") { withAnimation(.snappy(duration: 0.28)) { session.goToNextUnreviewed() } }
                Button("Comment or request changes…", systemImage: "text.bubble") { deciding = true }
                Divider()
                Button(skipTitle, systemImage: "forward") { advance() }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "lock")
                    Text(verbatim: "\(session.left) left").monospacedDigit()
                }
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(BD.text3)
                .padding(.horizontal, 4)
            }
            .accessibilityLabel("Approve is locked, \(session.left) left")
        }
    }

    @ViewBuilder
    private var bottomBar: some View {
        switch page {
        case .walk:
            if let session { WalkBar(session: session, onMark: markReviewed) }
        case .brief:
            if let session {
                HStack(spacing: 12) {
                    previousPullRequest
                    if session.isDone {
                        Button { deciding = true } label: { Label("Decide", systemImage: "checkmark.seal") }.buttonStyle(.bdPrimary)
                    } else {
                        Button(action: start) { Label("Start with \(startName(session))", systemImage: "eye") }
                            .buttonStyle(.bdPrimary)
                            .accessibilityIdentifier("brief-start")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 20)
                .padding(.bottom, 4)
                .background(barFade)
            }
        case .decided(let decision):
            if let session {
                VStack(spacing: 11) {
                    HStack(spacing: 12) {
                        previousPullRequest
                        if case .failed = decision.status {
                            Button { deciding = true } label: { Label("Decide again", systemImage: "arrow.uturn.backward") }.buttonStyle(.bdPrimary)
                        } else {
                            Button(action: advance) {
                                HStack(spacing: 8) {
                                    Text(nextKey.map { "Next: #\($0.number)" } ?? "Finish")
                                    Image(systemName: "chevron.right")
                                }
                            }
                            .buttonStyle(.bdPlain)
                        }
                    }
                    let summary = session.walk.reviewedSummary(session.reviewed)
                    (Text("Reviewed").fontWeight(.semibold).foregroundStyle(BD.text) + Text(summary.isEmpty ? "" : " · " + summary).foregroundStyle(BD.text3))
                        .font(.system(size: 13))
                        .monospacedDigit()
                }
                .padding(.horizontal, 16)
                .padding(.top, 20)
                .padding(.bottom, 4)
                .background(barFade)
            }
        case .loading, .finished:
            EmptyView()
        }
    }

    @ViewBuilder
    private var previousPullRequest: some View {
        if position > 0 {
            GlassIconButton(systemImage: "chevron.left", label: "Previous pull request", size: 52) { position -= 1 }
        }
    }

    private var barFade: some View {
        LinearGradient(stops: [.init(color: BD.bg.opacity(0), location: 0), .init(color: BD.bg, location: 0.38)], startPoint: .top, endPoint: .bottom)
            .ignoresSafeArea()
    }

    /// "retry.ts", or "the tests" when the walk starts on a step.
    private func startName(_ session: ReviewSession) -> String {
        switch session.walk.start(session.reviewed) {
        case .file(let path): path.splitPath.name
        case .step(let group): "the \(group.stepName)"
        case nil: "the files"
        }
    }

    private var finished: some View {
        VStack(spacing: 14) {
            let decided = queue.filter { app.focus.reviewDecisions[$0.key] != nil }.count
            Image(systemName: decided > 0 ? "checkmark.circle" : "forward.circle").font(.system(size: 52, weight: .light))
                .foregroundStyle(decided > 0 ? BD.green : BD.text3)
            Text(ReviewRunSummary.title(total: queue.count, decided: decided)).font(.title2.bold()).foregroundStyle(BD.text)
            Text(ReviewRunSummary.detail(decided: decided)).font(.subheadline).foregroundStyle(BD.text2)
            Button("Back to Focus") { dismiss() }.buttonStyle(.bd(.plain, height: 46)).frame(width: 200).padding(.top, 8)
        }
    }
}

extension Router {
    /// The pull request whose page is on top of the current tab: a review started from it skips the brief.
    var visiblePullRequest: PrKey? {
        let path: [Route] = switch tab {
        case .today: todayPath
        case .pullRequests: pullRequestsPath
        case .work: workPath
        case .sprint: sprintPath
        case .search: searchPath
        }
        if case .pullRequest(let key) = path.last { return key }
        return nil
    }
}
