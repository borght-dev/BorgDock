import SwiftUI

/// The home tab: the review queue, your agents, your turn, ready to merge and what waits on others, then the sprint
/// and your work. Mockup: design/ios-flow/mockups.html, section 02.
struct FocusView: View {
    @Environment(AppModel.self) private var app
    @AppStorage(PrListFilter.storageKey) private var pullRequestFilter: PrListFilter = .all
    @State private var now = Date.now
    @State private var showsEveryAgent = false

    var body: some View {
        let store = app.focus
        let board = FocusBoard(pullRequests: store.focus?.pullRequests ?? [], threads: app.allThreads, myLogins: store.myLogins)
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if store.focus == nil, let error = store.error {
                        StatusCard(icon: "wifi.exclamationmark", text: "Can't load pull requests: \(error)", tone: .warn)
                    }
                    ReviewQueueCard(board: board, loaded: store.focus != nil, now: now) {
                        app.router.review(board.reviews.map(\.prKey))
                    }
                    agents(board)
                    yourTurn(board)
                    VStack(alignment: .leading, spacing: 0) { readyToMerge(board) }.id(FocusAnchor.readyToMerge)
                    waiting(board)
                    work
                }
                .padding(.bottom, 24)
            }
            .onChange(of: app.router.scrollTarget) { _, target in
                guard let target, let anchor = FocusAnchor(rawValue: target) else { return }
                proxy.scrollTo(anchor, anchor: .top)
                app.router.scrollTarget = nil
            }
        }
        .background(BD.bg)
        .navigationTitle("Focus")
        .toolbar { toolbar }
        .refreshable {
            async let pullRequests: Void = store.load(reportErrors: true)
            async let sprint: Void = app.sprint.load(reportErrors: true)
            async let items: Void = app.refreshOverview()
            _ = await (pullRequests, sprint, items)
        }
        .overlay(alignment: .bottom) { ApprovalToast().padding(.bottom, 8) }
        .task {
            #if DEBUG
            DebugSigner.installIfSampleServer(app)
            Task { await I1DebugRoute.apply(app) }
            #endif
            await store.loadPreferences()
        }
        .task { await store.poll() }
        .task { await app.sprint.poll() }
        .task {
            while !Task.isCancelled {
                now = .now
                try? await Task.sleep(for: .seconds(20))
            }
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private func agents(_ board: FocusBoard) -> some View {
        if !board.agents.isEmpty {
            FocusHeader(title: "Agents", trailing: board.agentsSummary)
            CellGroup(indent: 37) {
                ForEach(showsEveryAgent ? board.agents : board.shownAgents) { thread in
                    let pullRequest = app.pullRequest(for: thread)
                    let item = app.overview?.items.first { $0.threads.contains { $0.id == thread.id } }?.item
                    AgentRow(thread: thread, subject: FocusBoard.subject(of: thread, pullRequest: pullRequest, item: item))
                        .onTapGesture { open(thread, pullRequest: pullRequest, itemId: item?.id) }
                        .accessibilityAddTraits(.isButton)
                        .accessibilityIdentifier("focus-agent-\(thread.id)")
                }
                if let more = board.moreAgents, !showsEveryAgent {
                    Button { withAnimation(.snappy) { showsEveryAgent = true } } label: {
                        Text(more)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(BD.accentText)
                            .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
                            .padding(.leading, 37)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("focus-more-agents")
                }
            }
        }
    }

    /// An agent row opens what it works on: its pull request, else its item, else the thread in T3 Code.
    private func open(_ thread: ThreadSummary, pullRequest: PrSummary?, itemId: Int?) {
        if let pullRequest {
            app.router.push(.pullRequest(pullRequest.prKey))
        } else if let itemId {
            app.router.push(ItemRoute(id: itemId))
        } else {
            T3Link.open(thread)
        }
    }

    @ViewBuilder
    private func yourTurn(_ board: FocusBoard) -> some View {
        if !board.yourTurn.isEmpty {
            FocusHeader(title: "Your turn", trailing: "\(board.yourTurn.count)")
            CellGroup(indent: 57) {
                ForEach(board.yourTurn) { pr in
                    Button { app.router.push(.pullRequest(pr.prKey)) } label: { FocusPrRow(pr: pr, now: now) }
                        .buttonStyle(.plain)
                        .contextMenu { PrContextMenu(pr: pr) }
                        .accessibilityIdentifier("focus-pr-\(pr.key)")
                }
            }
        } else if app.focus.focus != nil {
            StatusCard(icon: "checkmark.circle", text: "Nothing waits on you. Pull to refresh, or look at the sprint.", tone: .ok)
        }
    }

    @ViewBuilder
    private func readyToMerge(_ board: FocusBoard) -> some View {
        if !board.readyToMerge.isEmpty {
            let names = ReadyLine.firstNames(app.focus.focus?.pullRequests ?? [])
            FocusHeader(title: "Ready to merge", trailing: "\(board.readyToMerge.count)")
            CellGroup {
                ForEach(board.readyToMerge) { pr in
                    Button { app.router.push(.pullRequest(pr.prKey)) } label: {
                        CompactCell(title: pr.title, subtitle: ReadyLine.text(pr, firstNames: names, myLogins: app.focus.myLogins)) {
                            if pr.canMerge {
                                Button { app.router.present(.merge(pr.prKey)) } label: {
                                    Label("Merge", systemImage: "arrow.triangle.merge")
                                        .labelStyle(TightLabelStyle(spacing: 6))
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(BD.onAccent)
                                        .padding(.horizontal, 13)
                                        .frame(height: 34)
                                        .background(BD.accent, in: Capsule())
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("focus-merge-\(pr.key)")
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .contextMenu { PrContextMenu(pr: pr) }
                }
            }
        }
    }

    @ViewBuilder
    private func waiting(_ board: FocusBoard) -> some View {
        if !board.waitingOnOthers.isEmpty {
            CellGroup {
                Button {
                    pullRequestFilter = .waiting
                    app.router.tab = .pullRequests
                } label: {
                    HStack(spacing: 10) {
                        CellIcon(systemImage: "clock", color: BD.text2, soft: true, round: true)
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Waiting on others").font(.system(size: 15.5, weight: .semibold)).foregroundStyle(BD.text)
                            Text(board.waitingDetail(now: now)).font(.system(size: 12.5)).foregroundStyle(BD.text2).lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        CellChevron()
                    }
                    .padding(.leading, 16)
                    .padding(.trailing, 14)
                    .frame(minHeight: 54)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("focus-waiting")
            }
            .padding(.top, 12)
        }
    }

    @ViewBuilder
    private var work: some View {
        FocusHeader(title: "Work")
        CellGroup(indent: 58) {
            Button { app.router.tab = .sprint } label: {
                CompactCell(title: sprintTitle, subtitle: sprintLine) {
                    CellIcon(systemImage: "calendar", color: BD.accent)
                } trailing: {
                    CellChevron()
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("focus-sprint")
            Button { app.router.tab = .work } label: {
                CompactCell(title: "My work", subtitle: workLine) {
                    CellIcon(systemImage: "checklist", color: BD.yellow)
                } trailing: {
                    CellChevron()
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("focus-work")
        }
    }

    private var sprintTitle: String {
        app.sprint.sprint.map { "Sprint \($0.name)" } ?? "Sprint"
    }

    /// "6 days left · 14 of 42 done". The server sends no story points, so it counts backlog items.
    private var sprintLine: String {
        guard let stats = app.sprint.stats(.team) else { return app.sprint.error ?? "Loading…" }
        var parts: [String] = []
        if let left = stats.daysLeft { parts.append(left == 0 ? "last day" : left == 1 ? "1 day left" : "\(left) days left") }
        parts.append("\(stats.done) of \(stats.total) done")
        return parts.joined(separator: " · ")
    }

    /// "7 open · 2 need you".
    private var workLine: String {
        guard let overview = app.overview else { return app.overviewError ?? "Loading…" }
        let needYou = app.dispatchBadge
        return "\(overview.items.count) open" + (needYou > 0 ? " · \(needYou) need\(needYou == 1 ? "s" : "") you" : "")
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .largeSubtitle) {
            let store = app.focus
            Text(FocusSubtitle.text(syncedAt: store.syncedAt, isLoading: store.isLoading, failed: store.error != nil, now: now))
                .font(.system(size: 15))
                .foregroundStyle(BD.text2)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        ToolbarItem(placement: .topBarLeading) {
            Button { app.router.push(.activity) } label: {
                if app.activity.unread > 0 {
                    Image(systemName: "bell.badge").symbolRenderingMode(.palette).foregroundStyle(BD.red, BD.text)
                } else {
                    Image(systemName: "bell").foregroundStyle(BD.text)
                }
            }
            .accessibilityLabel(app.activity.unread > 0 ? "Activity, \(app.activity.unread) new" : "Activity")
            .accessibilityIdentifier("open-activity")
        }
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button("Quick note", systemImage: "square.and.pencil") { app.router.present(.quickCapture) }
                Button("All notes", systemImage: "note.text") { app.router.push(.notes) }
            } label: {
                Image(systemName: "doc.text").foregroundStyle(BD.text)
            } primaryAction: {
                app.router.present(.quickCapture)
            }
            .accessibilityLabel("Notes")
            .accessibilityHint("Writes a quick note. Touch and hold for all notes.")
            .accessibilityIdentifier("open-notes")
        }
        ToolbarSpacer(.fixed, placement: .topBarTrailing)
        ToolbarItem(placement: .topBarTrailing) {
            Button { app.router.present(.settings) } label: { MeAvatar(size: 44) }
                .buttonStyle(.plain)
                .accessibilityLabel("Settings")
        }
        .sharedBackgroundVisibility(.hidden)
    }
}

/// Places a debug route can scroll Focus to (`focus/<anchor>`).
enum FocusAnchor: String {
    case readyToMerge = "ready"
}

/// A small header above a Focus group: "Agents   2 running · 1 asks you".
private struct FocusHeader: View {
    let title: String
    var trailing: String?

    var body: some View {
        GroupHeader(title: title, trailing: trailing).padding(.horizontal, 16)
    }
}

/// "6 reviews wait for you", who asks, how much reading it is, and Start review over the queue, oldest first.
private struct ReviewQueueCard: View {
    let board: FocusBoard
    let loaded: Bool
    let now: Date
    let start: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Text(loaded ? board.reviewsTitle : "Reviews")
                    .font(.system(size: 21, weight: .bold))
                    .tracking(-0.4)
                    .foregroundStyle(BD.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 4)
                StackedAvatars(people: Array(board.reviewAuthors.prefix(3)))
            }
            let detail = board.reviewsDetail(now: now)
            if !detail.isEmpty {
                Text(detail).font(.system(size: 14)).foregroundStyle(BD.text2).lineLimit(1).padding(.top, 3)
            }
            if !board.reviews.isEmpty {
                Button(action: start) {
                    Label("Start review", systemImage: "eye").labelStyle(TightLabelStyle(spacing: 8))
                }
                .buttonStyle(.bd(.primary, height: 48))
                .padding(.top, 12)
                .accessibilityIdentifier("focus-start-review")
            } else if !loaded {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 12)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .bdCard(radius: 24)
        .padding(.horizontal, 16)
        .padding(.top, 14)
    }
}

/// Up to three authors' avatars, each overlapping the one before, ringed in the card's colour.
private struct StackedAvatars: View {
    let people: [Person]

    var body: some View {
        HStack(spacing: -5) {
            ForEach(people, id: \.login) { person in
                PersonAvatar(name: person.displayName, size: 20)
                    .padding(2)
                    .background(BD.card, in: Circle())
            }
        }
        .accessibilityHidden(true)
    }
}

/// A pull request on Focus: who wrote it, repository and number, how long it waited, the title and why it is yours.
struct FocusPrRow: View {
    let pr: PrSummary
    var now: Date = .now

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            if pr.isMine {
                MeAvatar(size: 32)
            } else {
                PersonAvatar(name: pr.author.displayName, size: 32)
            }
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Text(pr.repo).fontWeight(.semibold).foregroundStyle(BD.text)
                    Text(pr.repoLabel).foregroundStyle(BD.text2)
                    Spacer(minLength: 6)
                    Text(ShortTime.age(pr.isMine ? pr.updatedAt : pr.waitingSince, now: now)).foregroundStyle(BD.text2)
                }
                .font(.system(size: 13))
                .lineLimit(1)
                Text(pr.title)
                    .font(.system(size: 15.5, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(BD.text)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 3)
                WhyLine(why: FocusWhy(pr)).padding(.top, 4)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 11)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// "👁 Review requested · 8 files" in the accent, "⊗ Your PR, 2 checks failing" in red.
private struct WhyLine: View {
    let why: FocusWhy

    var body: some View {
        Label {
            Text(why.text).lineLimit(1)
        } icon: {
            Image(systemName: why.systemImage).font(.system(size: 12.5, weight: .medium))
        }
        .labelStyle(TightLabelStyle(spacing: 6))
        .font(.system(size: 13))
        .foregroundStyle(color)
    }

    private var color: Color {
        switch why.emphasis {
        case .accent: BD.accentText
        case .tone(.mute): BD.text2
        case .tone(let tone): tone.color
        }
    }
}

/// Your initials on the accent gradient: the account button and your own pull requests.
struct MeAvatar: View {
    @Environment(AppModel.self) private var app
    var size: CGFloat = 32

    var body: some View {
        Text(PersonNames.initials(app.config?.user.name ?? "Me"))
            .font(.system(size: size * 0.36, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(LinearGradient(colors: [BD.brandIndigo, Color(hex: 0x4F46E5)], startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
            .accessibilityHidden(true)
    }
}
