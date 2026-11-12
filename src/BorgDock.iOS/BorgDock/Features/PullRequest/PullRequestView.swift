import SwiftUI

/// A pull request on one scrolling page: the header (is it green, does it conflict, which work item), the agents on
/// its branch, then checks, proof, description, comments and files under a jump bar that pins below the nav bar.
/// The bottom holds the next step, or the reply box while you read the comments. Mockup: design/ios-flow, section 04.
struct PullRequestView: View {
    @Environment(AppModel.self) private var app
    let key: PrKey
    @State private var selection: String?
    @State private var jumpingTo: PrPageSection?
    @State private var pendingJump: PrPageSection?
    @State private var tops: [PrPageSection: CGFloat] = [:]
    @State private var barTop: CGFloat = .infinity
    @State private var barHeight: CGFloat = 52
    @State private var titleBottom: CGFloat = .infinity
    @State private var pinned = false
    @State private var compactTitle = false
    @State private var position = ScrollPosition()

    private nonisolated static let page = "pr-page"

    var body: some View {
        let store = app.focus
        let detail = store.details[key.key]
        ScrollView {
            if let detail {
                content(detail)
            } else if let summary = store.summary(key) {
                PrHeaderPlaceholder(summary: summary)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 120)
            }
        }
        .scrollPosition($position)
        .onScrollGeometryChange(for: PageScroll.self) { geometry in
            PageScroll(offset: geometry.contentOffset.y + geometry.contentInsets.top,
                       visibleHeight: geometry.containerSize.height - geometry.contentInsets.top - geometry.contentInsets.bottom,
                       atBottom: geometry.contentOffset.y + geometry.containerSize.height >= geometry.contentSize.height + geometry.contentInsets.bottom - 2)
        } action: { _, scroll in
            follow(scroll, detail: detail)
        }
        .onScrollPhaseChange { _, phase in
            if phase == .interacting { jumpingTo = nil }
        }
        .overlay(alignment: .top) {
            if let detail {
                jumpBar(detail)
                    .opacity(pinned ? 1 : 0)
                    .allowsHitTesting(pinned)
                    .accessibilityHidden(!pinned)
            }
        }
        .background(BD.bg)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar { toolbar(detail) }
        .tint(BD.text)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let detail {
                Group {
                    if selection == PrPageSection.comments.rawValue {
                        CommentComposer(key: key, detail: detail)
                    } else {
                        PrBottomBar(detail: detail, offersFix: selection == nil || selection == PrPageSection.checks.rawValue)
                    }
                }
                .padding(.top, 30)
                .background {
                    LinearGradient(stops: [.init(color: BD.bg.opacity(0), location: 0), .init(color: BD.bg, location: 0.6)], startPoint: .top, endPoint: .bottom)
                        .ignoresSafeArea(edges: .bottom)
                        .allowsHitTesting(false)
                }
            }
        }
        .environment(\.markdownWorkItemTypes, Dictionary((detail?.workItems ?? []).map { ($0.id, $0.typeName) }, uniquingKeysWith: { first, _ in first }))
        .refreshable { await reload() }
        .task {
            await reload()
            await jumpWhenLaidOut()
        }
        #if DEBUG
        .onAppear {
            pendingJump = app.focus.debugPrTab.flatMap(PrPageSection.init(rawValue:))
            app.focus.debugPrTab = nil
        }
        #endif
    }

    // MARK: Page

    private func content(_ detail: PrDetail) -> some View {
        let sections = order(detail)
        return VStack(alignment: .leading, spacing: 0) {
            PrHeader(detail: detail) { jump(to: .checks) }
                .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(Self.page)).maxY - 40 } action: { titleBottom = $0 }
            jumpBar(detail)
                .padding(.top, 2)
                .opacity(pinned ? 0 : 1)
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.page)) } action: {
                    barTop = $0.minY
                    barHeight = $0.height
                }
            if !detail.threads.isEmpty {
                PrGroupCard(indent: 37) {
                    ForEach(detail.threads) { AgentRow(thread: $0) }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
            }
            ForEach(sections, id: \.self) { section in
                sectionView(section, detail: detail)
                    .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(Self.page)).minY } action: { tops[section] = $0 }
            }
        }
        .padding(.bottom, 24)
        .coordinateSpace(.named(Self.page))
    }

    @ViewBuilder
    private func sectionView(_ section: PrPageSection, detail: PrDetail) -> some View {
        switch section {
        case .checks:
            VStack(alignment: .leading, spacing: 0) {
                PrSectionLabel(title: "Checks", trailing: ChecksLabel.text(detail.checkRuns))
                ChecksContent(detail: detail, files: app.focus.files[key.key]?.files ?? []).padding(.horizontal, 16)
            }
        case .proof:
            VStack(alignment: .leading, spacing: 0) {
                PrSectionLabel(title: "Proof", trailing: detail.proofImages.count == 1 ? "1 image" : "\(detail.proofImages.count) images")
                ProofRow(images: detail.proofImages)
            }
        case .description:
            VStack(alignment: .leading, spacing: 0) {
                PrSectionLabel(title: "Description")
                PrDescription(detail: detail).padding(.horizontal, 16)
            }
        case .comments:
            PrCommentsSection(key: key, detail: detail)
        case .files:
            PrFilesSection(detail: detail)
        }
    }

    private func jumpBar(_ detail: PrDetail) -> some View {
        let comments = PrComments(conversation: app.focus.conversations[key.key], reviews: detail.reviews)
        let items = PrPageSection.jumpItems(order(detail), proof: detail.proofImages.count, comments: comments.count, files: detail.changedFiles)
        return JumpBar(items: items, selection: $selection) { id in
            if let section = PrPageSection(rawValue: id) { jump(to: section) }
        }
    }

    private func order(_ detail: PrDetail) -> [PrPageSection] {
        PrPageSection.order(failing: detail.checks.failed > 0, hasProof: !detail.proofImages.isEmpty)
    }

    // MARK: Scrolling

    private struct PageScroll: Equatable {
        let offset: CGFloat
        let visibleHeight: CGFloat
        let atBottom: Bool
    }

    private func follow(_ scroll: PageScroll, detail: PrDetail?) {
        let isPinned = scroll.offset >= barTop
        if pinned != isPinned { pinned = isPinned }
        let isCompact = scroll.offset >= titleBottom
        if compactTitle != isCompact { withAnimation(.easeOut(duration: 0.15)) { compactTitle = isCompact } }
        guard jumpingTo == nil, let detail else { return }
        let sections = order(detail)
        let readingLine = scroll.offset + barHeight + (scroll.visibleHeight - barHeight) * 0.4
        let visible = scroll.atBottom && scroll.offset > 0 ? sections.last : PrPageSection.visible(sections, tops: tops, line: readingLine)
        if selection != visible?.rawValue { selection = visible?.rawValue }
    }

    private func jump(to section: PrPageSection) {
        guard let top = tops[section] else { return }
        jumpingTo = section
        selection = section.rawValue
        withAnimation(.snappy(duration: 0.35)) { position.scrollTo(y: max(0, top - barHeight)) }
    }

    /// Opens on a section once the comments and files it scrolls past have loaded (DEBUG screenshots).
    private func jumpWhenLaidOut() async {
        guard let section = pendingJump else { return }
        pendingJump = nil
        try? await Task.sleep(for: .milliseconds(600))
        jump(to: section)
    }

    private func reload() async {
        async let detail: Void = { _ = await app.focus.loadDetail(key) }()
        async let conversation: Void = { _ = await app.focus.loadConversation(key) }()
        async let files: Void = { _ = await app.focus.loadFiles(key) }()
        _ = await (detail, conversation, files)
    }

    // MARK: Toolbar

    @ToolbarContentBuilder
    private func toolbar(_ detail: PrDetail?) -> some ToolbarContent {
        if let detail {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text(PrTitle.short(detail.title)).font(.system(size: 16, weight: .semibold)).foregroundStyle(BD.text)
                    Text(verbatim: "\(detail.owner)/\(detail.repo) #\(detail.number)").font(.system(size: 12)).foregroundStyle(BD.text2)
                }
                .lineLimit(1)
                .opacity(compactTitle ? 1 : 0)
                .accessibilityHidden(!compactTitle)
            }
            if !compactTitle, let url = URL(string: detail.url) {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }
                }
                ToolbarSpacer(.fixed, placement: .topBarTrailing)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if compactTitle, let url = URL(string: detail.url) {
                        ShareLink(item: url) { Label("Share", systemImage: "square.and.arrow.up") }
                    }
                    if detail.checks.failed > 0 {
                        Button { Task { await app.focus.rerunFailed(key) } } label: { Label("Rerun failed checks", systemImage: "arrow.counterclockwise") }
                    }
                    if !detail.checkRuns.isEmpty {
                        Button { app.router.present(.checks(key)) } label: { Label("All checks", systemImage: "checklist") }
                    }
                    Divider()
                    PrContextMenu(pr: detail.summary)
                } label: {
                    Image(systemName: "ellipsis")
                }
            }
        }
    }
}

// MARK: - Header

struct PrHeader: View {
    @Environment(AppModel.self) private var app
    let detail: PrDetail
    let openChecks: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: stateIcon).font(.system(size: 13, weight: .semibold)).foregroundStyle(stateColor)
                Text(verbatim: "\(detail.owner)/\(detail.repo)").fontWeight(.semibold).foregroundStyle(BD.text)
                Text(verbatim: "#\(detail.number) · \(stateLabel)").foregroundStyle(BD.text2).padding(.leading, -4)
            }
            .font(.system(size: 14))
            .lineLimit(1)

            Text(detail.title)
                .font(.system(size: 23, weight: .bold))
                .tracking(-0.55)
                .lineSpacing(1)
                .foregroundStyle(BD.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 7)

            HStack(spacing: 7) {
                PersonBadge(person: detail.author, size: 20)
                Text(verbatim: "\(detail.author.displayName) · \(detail.commits) commit\(detail.commits == 1 ? "" : "s") ·")
                    .lineLimit(1)
                BranchName(name: detail.headRef, size: 12)
            }
            .font(.system(size: 14))
            .foregroundStyle(BD.text2)
            .padding(.top, 9)

            if !detail.labels.isEmpty {
                FlowLayout {
                    ForEach(detail.labels, id: \.self) { GitHubLabel(name: $0.name, hex: $0.color) }
                }
                .padding(.top, 11)
            }

            FlowLayout {
                if let chip = checksChip {
                    Button(action: openChecks) { PrChipView(chip: chip) }.buttonStyle(.plain)
                }
                PrChipView(chip: conflictChip)
                if let reviewChip { PrChipView(chip: reviewChip) }
                ForEach(detail.workItems) { item in
                    Button { app.router.push(.workItem(ItemRoute(id: item.id, prefill: item))) } label: {
                        ToneChip(text: "AB#\(item.id)", accent: true)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("AB#\(item.id) \(item.title), \(item.state)")
                    .contextMenu {
                        if let url = URL(string: item.url) { Link(destination: url) { Label("Open in Azure DevOps", systemImage: "arrow.up.right.square") } }
                    }
                }
            }
            .padding(.top, 11)
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }

    private var stateIcon: String {
        switch detail.state {
        case .merged: "arrow.triangle.merge"
        case .closed: "xmark.circle"
        case .open: detail.isDraft ? "circle.dashed" : "arrow.triangle.pull"
        }
    }

    private var stateColor: Color {
        switch detail.state {
        case .merged: BD.merged
        case .closed: BD.red
        case .open: detail.isDraft ? BD.text3 : BD.green
        }
    }

    private var stateLabel: String {
        switch detail.state {
        case .merged: "Merged"
        case .closed: "Closed"
        case .open: detail.isDraft ? "Draft" : "Open"
        }
    }

    private var checksChip: PrChip? {
        let checks = detail.checks
        if checks.failed > 0 { return PrChip(text: "\(checks.failed) failing", style: .tone(.bad), systemImage: "xmark") }
        if checks.pending > 0 { return PrChip(text: "\(checks.pending) running", style: .tone(.run), running: true) }
        if checks.total > 0 { return PrChip(text: "Checks pass", style: .tone(.ok), systemImage: "checkmark") }
        return nil
    }

    /// Approved or changes requested; a PR still waiting for reviews shows nothing.
    private var reviewChip: PrChip? {
        switch detail.reviewDecision {
        case .approved: PrReviewState.approved.chip
        case .changesRequested: PrReviewState.changesRequested.chip
        default: nil
        }
    }

    private var conflictChip: PrChip {
        switch detail.mergeable {
        case .mergeable: PrChip(text: "No conflicts", style: .tone(.ok), systemImage: "checkmark")
        case .conflicting: PrChip(text: "Conflicts", style: .tone(.warn), systemImage: "exclamationmark.triangle")
        case .unknown: PrChip(text: "Checking conflicts", style: .tone(.mute))
        }
    }
}

/// The card's facts while the detail loads.
struct PrHeaderPlaceholder: View {
    let summary: PrSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(verbatim: "\(summary.owner)/\(summary.repo) #\(summary.number)").font(.system(size: 14, weight: .semibold)).foregroundStyle(BD.text2)
            Text(summary.title).font(.system(size: 23, weight: .bold)).foregroundStyle(BD.text)
            ProgressView().padding(.top, 30).frame(maxWidth: .infinity)
        }
        .padding(16)
    }
}

// MARK: - Bottom bar

/// Fix (while failing checks are on screen) and the next step: Start review on someone else's PR, Merge on yours.
struct PrBottomBar: View {
    @Environment(AppModel.self) private var app
    let detail: PrDetail
    /// Fix sits next to the checks; further down the page the next step has the bar to itself.
    var offersFix = true

    var body: some View {
        HStack(spacing: 10) {
            if offersFix, detail.checks.failed > 0 {
                Button { app.focus.fixWithClaude(detail.summary) } label: {
                    Label("Fix", systemImage: "sparkle")
                        .font(.system(size: 17, weight: .semibold))
                        .padding(.horizontal, 8)
                        .frame(height: 44)
                }
                .buttonStyle(.glass)
                .tint(BD.text)
            }
            if detail.isMine {
                if detail.state == .open, detail.mergeable != .conflicting, !detail.isDraft {
                    Button { app.router.present(.merge(detail.summary.prKey)) } label: {
                        Label(detail.checks.pending > 0 ? "Merge when ready" : "Merge", systemImage: "arrow.triangle.merge")
                    }
                    .buttonStyle(.bdGo)
                    .disabled(detail.checks.failed > 0)
                } else if let url = URL(string: detail.url) {
                    Link(destination: url) { Label("Open on GitHub", systemImage: "arrow.up.right.square") }.buttonStyle(.bdPlain)
                }
            } else {
                Button { app.router.review(app.focus.reviewQueue(startingAt: detail.summary)) } label: {
                    Label(detail.reviewedHeadSha != nil && detail.reviewedHeadSha != detail.headSha ? "Re-review" : "Start review", systemImage: "eye")
                }
                .buttonStyle(.bdPrimary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }
}
