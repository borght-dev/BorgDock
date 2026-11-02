import SwiftUI

/// A pull request on one screen: the header answers is it green, does it conflict, which work item; the tabs keep the
/// desktop's Overview, Files, Checks, Proof and Comments; the bottom bar holds the next step.
struct PullRequestView: View {
    @Environment(AppModel.self) private var app
    let key: PrKey
    @State private var tab: PrTab = .overview

    enum PrTab: Hashable { case overview, files, checks, proof, comments }

    var body: some View {
        let store = app.focus
        let detail = store.details[key.key]
        ScrollView {
            if let detail {
                VStack(alignment: .leading, spacing: 0) {
                    PrHeader(detail: detail) { tab = $0 }
                    PrTabStrip(detail: detail, conversation: store.conversations[key.key], selection: $tab)
                        .padding(.top, 18)
                    Group {
                        switch tab {
                        case .overview: PrOverviewTab(detail: detail)
                        case .files: PrFilesTab(detail: detail)
                        case .checks: ChecksContent(detail: detail).padding(.horizontal, 16).padding(.top, 14)
                        case .proof: PrProofTab(detail: detail)
                        case .comments: PrConversationContent(key: key, detail: detail, onProof: { tab = .proof })
                        }
                    }
                    .padding(.bottom, 110)
                }
            } else if let summary = store.summary(key) {
                PrHeaderPlaceholder(summary: summary)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 120)
            }
        }
        .background(BD.bg)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            if let detail {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: URL(string: detail.url)!) { Image(systemName: "square.and.arrow.up") }
                }
                ToolbarSpacer(.fixed, placement: .topBarTrailing)
                ToolbarItem(placement: .topBarTrailing) {
                    Menu { PrContextMenu(pr: detail.summary) } label: { Image(systemName: "ellipsis") }
                }
            }
        }
        .tint(BD.text)
        .safeAreaInset(edge: .bottom) {
            if let detail {
                if tab == .comments {
                    CommentComposer(key: key, detail: detail)
                } else {
                    PrBottomBar(detail: detail)
                }
            }
        }
        .refreshable { await reload() }
        .task { await reload() }
        #if DEBUG
        .onAppear {
            switch app.focus.debugPrTab {
            case "files": tab = .files
            case "checks": tab = .checks
            case "proof": tab = .proof
            case "comments": tab = .comments
            default: break
            }
            app.focus.debugPrTab = nil
        }
        #endif
    }

    private func reload() async {
        async let detail: Void = { _ = await app.focus.loadDetail(key) }()
        async let conversation: Void = { _ = await app.focus.loadConversation(key) }()
        _ = await (detail, conversation)
    }
}

// MARK: - Header

struct PrHeader: View {
    @Environment(AppModel.self) private var app
    let detail: PrDetail
    let openTab: (PullRequestView.PrTab) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: stateIcon).font(.system(size: 14, weight: .semibold)).foregroundStyle(stateColor)
                Text(verbatim: "\(detail.owner)/\(detail.repo)").fontWeight(.semibold).foregroundStyle(BD.text)
                Text(verbatim: "#\(detail.number) · \(stateLabel)").foregroundStyle(BD.text2)
            }
            .font(.system(size: 15))
            .lineLimit(1)

            Text(detail.title)
                .font(.system(size: 25, weight: .bold))
                .tracking(-0.5)
                .foregroundStyle(BD.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)

            HStack(spacing: 7) {
                PersonBadge(person: detail.author, size: 22)
                Text(verbatim: "\(detail.author.displayName) · \(detail.commits) commit\(detail.commits == 1 ? "" : "s") ·")
                    .lineLimit(1)
                BranchName(name: detail.headRef)
            }
            .font(.system(size: 15))
            .foregroundStyle(BD.text2)
            .padding(.top, 10)

            if !detail.labels.isEmpty {
                FlowLayout {
                    ForEach(detail.labels, id: \.self) { GitHubLabel(name: $0.name, hex: $0.color) }
                }
                .padding(.top, 12)
            }

            FlowLayout {
                if let chip = checksChip {
                    Button { app.router.present(.checks(detail.summary.prKey)) } label: { PrChipView(chip: chip) }.buttonStyle(.plain)
                }
                PrChipView(chip: conflictChip)
                ForEach(detail.workItems) { item in
                    Button { app.router.push(.workItem(ItemRoute(id: item.id, prefill: item))) } label: {
                        HStack(spacing: 6) {
                            WorkItemGlyph(typeName: item.typeName, size: 10)
                            Text(verbatim: "AB#\(item.id) · \(item.state)")
                        }
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(BD.accentText)
                        .padding(.horizontal, 9)
                        .frame(height: 24)
                        .background(BD.accentSoft, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        if let url = URL(string: item.url) { Link(destination: url) { Label("Open in Azure DevOps", systemImage: "arrow.up.right.square") } }
                    }
                }
            }
            .padding(.top, 12)
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
            Text(verbatim: "\(summary.owner)/\(summary.repo) #\(summary.number)").font(.system(size: 15, weight: .semibold)).foregroundStyle(BD.text2)
            Text(summary.title).font(.system(size: 28, weight: .bold)).foregroundStyle(BD.text)
            ProgressView().padding(.top, 30).frame(maxWidth: .infinity)
        }
        .padding(16)
    }
}

// MARK: - Tabs

struct PrTabStrip: View {
    let detail: PrDetail
    let conversation: PrConversation?
    @Binding var selection: PullRequestView.PrTab
    @Namespace private var underline

    var body: some View {
        ScrollViewReader { proxy in
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 26) {
                tab(.overview, "Overview")
                tab(.files, "Files", count: detail.changedFiles)
                tab(.checks, "Checks", dot: detail.checks.failed > 0 ? BD.red : detail.checks.pending > 0 ? BD.yellow : nil)
                if !detail.proofImages.isEmpty { tab(.proof, "Proof", count: detail.proofImages.count) }
                tab(.comments, "Comments", count: conversation.map { $0.comments.count + $0.threads.reduce(0) { $0 + $1.comments.count } })
            }
            .padding(.horizontal, 16)
        }
        .onAppear { proxy.scrollTo(selection, anchor: .center) }
        .onChange(of: selection) { withAnimation(.snappy) { proxy.scrollTo(selection, anchor: .center) } }
        }
        .overlay(alignment: .bottom) { Rectangle().fill(BD.separator).frame(height: 0.5) }
    }

    private func tab(_ value: PullRequestView.PrTab, _ title: String, count: Int? = nil, dot: Color? = nil) -> some View {
        let selected = selection == value
        return Button {
            withAnimation(.snappy(duration: 0.25)) { selection = value }
        } label: {
            HStack(spacing: 6) {
                Text(title)
                if let count, count > 0 { Text(verbatim: "\(count)") }
                if let dot { Circle().fill(dot).frame(width: 9, height: 9) }
            }
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(selected ? BD.text : BD.text2)
            .padding(.bottom, 12)
            .overlay(alignment: .bottom) {
                if selected {
                    Capsule().fill(BD.accent).frame(height: 3).matchedGeometryEffect(id: "underline", in: underline)
                }
            }
        }
        .buttonStyle(.plain)
        .id(value)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// MARK: - Bottom bar

struct PrBottomBar: View {
    @Environment(AppModel.self) private var app
    let detail: PrDetail

    var body: some View {
        HStack(spacing: 12) {
            if detail.checks.failed > 0 {
                Button { app.focus.fixWithClaude(detail.summary) } label: {
                    Label("Fix", systemImage: "sparkle")
                        .font(.system(size: 18, weight: .semibold))
                        .padding(.horizontal, 10)
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
