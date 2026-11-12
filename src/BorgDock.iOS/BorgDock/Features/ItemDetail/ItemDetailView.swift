import SwiftUI

/// One work item on one page: where it is in its workflow, then the section that decides the next step (QA's notes,
/// the pull requests, the agent's question or the description), the rest of its rich text, every linked pull request
/// and agent, its fields, and Activity with a reply box. "Move to…" and "Fix with agent" both start a run: BorgDock
/// never changes an ADO state on a button. Mockup: design/ios-flow, section 08.
struct ItemDetailView: View {
    let route: ItemRoute

    @Environment(AppModel.self) private var app
    @Environment(\.openURL) private var openURL
    @State private var detail: ItemDetail?
    @State private var loadError: String?
    /// Comments posted from this page since the last read.
    @State private var posted: [ItemComment] = []
    @State private var activityFilter: ItemActivity.Filter = .all
    @State private var draft = ""
    @State private var posting = false
    @State private var position = ScrollPosition(edge: .top)
    @State private var sectionTops: [String: CGFloat] = [:]
    @State private var titleBottom: CGFloat = 120
    @State private var scroll = ScrollSpot(top: 0, atBottom: false, visibleHeight: 600)
    @State private var selection: String?
    @State private var jumpedAt = Date.distantPast
    /// The section a chip jumped to stays under the bar for a few seconds while images above it load.
    @State private var pinned: String?

    private static let space = "item-page"
    private static let jumpBarHeight: CGFloat = 50

    private var entry: ItemOverview? { app.itemOverview(route.id) }
    private var item: WorkItemSummary? { entry?.item ?? detail?.item ?? route.prefill }
    private var me: String? { app.config?.user.name }
    private var openThreads: [ThreadSummary] { entry?.threads.filter { $0.status.isOpen } ?? [] }
    private var comments: [ItemComment] { (detail?.comments ?? []) + posted }
    private var headerGone: Bool { scroll.top > titleBottom - 6 }

    var body: some View {
        Group {
            if let item {
                page(item)
            } else if let loadError {
                ScrollView { StatusCard(icon: "exclamationmark.triangle", text: loadError, tone: .warn) }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(BD.bg)
        .navigationTitle(headerGone ? item?.title ?? "" : "")
        .navigationSubtitle(headerGone ? item.map { "AB#\(String($0.id)) · \($0.state)" } ?? "" : "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            if !headerGone, let url = item.flatMap({ URL(string: $0.url) }) {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { openURL(url) } label: { Image(systemName: "arrow.up.right.square") }
                        .accessibilityLabel("Open in Azure DevOps")
                }
            }
            ToolbarItem(placement: .topBarTrailing) { moreMenu }
        }
        .tint(BD.text)
        .task(id: route.id) { await load() }
        .refreshable {
            if let fresh = await app.refreshItem(route.id) {
                detail = fresh
                posted = []
                loadError = nil
            }
        }
    }

    private func load() async {
        do {
            detail = try await app.api.item(route.id)
            posted = []
            loadError = nil
        } catch is CancellationError {
        } catch {
            if (error as? APIError)?.isUnauthorized == true { app.report(error); return }
            loadError = error.localizedDescription
        }
    }

    // MARK: Page

    private func page(_ item: WorkItemSummary) -> some View {
        let sections = ItemLayout.sections(state: item.state, agentAsks: agentAsks(item), available: available())
        let jumps = ItemLayout.jumps(sections, activityCount: comments.count + (detail?.history.count ?? 0))
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header(item)
                    .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(Self.space)).maxY } action: { titleBottom = $0 }
                WorkflowTrackView(track: WorkflowTrack.of(item, history: detail?.history ?? []))
                    .padding(.horizontal, 16)
                    .padding(.top, 14)
                ForEach(sections) { section in
                    self.section(section, item: item, isLead: section == sections.first)
                        .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(Self.space)).minY } action: { sectionTops[section.id] = $0 }
                }
            }
            .padding(.bottom, 24)
            .coordinateSpace(.named(Self.space))
        }
        .scrollPosition($position)
        .onScrollGeometryChange(for: ScrollSpot.self) { geometry in
            let top = geometry.contentOffset.y + geometry.contentInsets.top
            return ScrollSpot(top: top, atBottom: top >= geometry.contentSize.height - geometry.containerSize.height - 4,
                              visibleHeight: geometry.containerSize.height)
        } action: { _, spot in
            scroll = spot
            follow(jumps, sections: sections)
        }
        .overlay(alignment: .top) {
            if headerGone {
                JumpBar(items: jumps, selection: $selection) { jump(to: $0, sections: sections, jumps: jumps) }
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.15), value: headerGone)
        .onChange(of: pinned.flatMap { sectionTops[$0] }) { _, top in
            guard let top, Date.now.timeIntervalSince(jumpedAt) < 3 else { return }
            position.scrollTo(y: max(0, top - Self.jumpBarHeight))
        }
        .safeAreaInset(edge: .bottom) {
            if selection == ItemSection.activity.id { composer(item) } else { bottomBar(item) }
        }
        .task(id: DebugJump(target: app.router.scrollTarget, ready: detail != nil && sectionTops[app.router.scrollTarget ?? ""] != nil)) {
            guard let target = app.router.scrollTarget, detail != nil, sectionTops[target] != nil else { return }
            app.router.scrollTarget = nil
            try? await Task.sleep(for: .seconds(1))
            jump(to: target, sections: sections, jumps: jumps)
        }
    }

    private func header(_ item: WorkItemSummary) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                WorkItemGlyph(typeName: item.typeName, size: 11)
                Text(verbatim: "\(item.type.label(typeName: item.typeName)) · AB#\(item.id)")
                Spacer(minLength: 8)
                ToneChip(text: item.state, tone: stateTone(item))
            }
            .font(.system(size: 13.5))
            .foregroundStyle(BD.text2)
            Text(item.title)
                .font(.system(size: 23, weight: .bold))
                .tracking(-0.55)
                .foregroundStyle(BD.text)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
                .padding(.top, 7)
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }

    private func stateTone(_ item: WorkItemSummary) -> Tone {
        if item.state.lowercased().contains("failed") { return .bad }
        switch item.stateCategory {
        case .inProgress, .resolved: return .run
        case .completed: return .ok
        default: return .mute
        }
    }

    // MARK: Sections

    @ViewBuilder
    private func section(_ section: ItemSection, item: WorkItemSummary, isLead: Bool) -> some View {
        switch section {
        case .qaNotes:
            ItemSectionLabel(title: section.title, trailing: qaNotesByline)
            RichTextCard(markdown: richText(section), attachments: detail?.attachments ?? [])
        case .description, .reproSteps, .acceptance, .developerNotes:
            ItemSectionLabel(title: section.title)
            RichTextCard(markdown: richText(section), attachments: detail?.attachments ?? [])
        case .pullRequests:
            let pullRequests = self.pullRequests
            ItemSectionLabel(title: section.title, trailing: String(pullRequests.count))
            CellGroup(indent: 14) {
                ForEach(pullRequests) { pr in
                    Button { open(pr) } label: { ItemPullRequestRow(pr: pr) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("item-pr-\(pr.number)")
                }
            }
        case .agents:
            ItemSectionLabel(title: openThreads.count == 1 ? "Agent" : "Agents", trailing: openThreads.count > 1 ? String(openThreads.count) : nil)
            CellGroup(indent: 37) {
                ForEach(openThreads) { thread in
                    Button { openAgent(thread) } label: { AgentRow(thread: thread) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("item-thread")
                }
            }
        case .details:
            ItemSectionLabel(title: section.title)
            ItemDetailsGrid(cells: ItemDetailCell.cells(item, detail: detail, sprint: app.sprint.sprint)) { parent in
                app.router.push(ItemRoute(id: parent.id))
            }
        case .activity:
            activity.frame(minHeight: scroll.visibleHeight - Self.jumpBarHeight, alignment: .top)
        }
    }

    private var activity: some View {
        let entries = ItemActivity.entries(comments: comments, history: detail?.history ?? [], filter: activityFilter, me: me)
        return VStack(alignment: .leading, spacing: 0) {
            ItemSectionLabel(title: "Activity", trailing: String(comments.count + (detail?.history.count ?? 0)))
            Picker("Show", selection: $activityFilter) {
                ForEach(ItemActivity.Filter.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            .controlSize(.large)
            .padding(.horizontal, 16)
            .padding(.bottom, 10)
            .accessibilityIdentifier("activity-filter")
            if entries.isEmpty {
                Text(detail == nil ? "Loading…" : "Nothing yet. Comments and state changes show here.")
                    .font(.system(size: 14))
                    .foregroundStyle(BD.text3)
                    .padding(.horizontal, 20)
            }
            ForEach(entries) { ActivityEntryView(entry: $0, me: me) }
        }
    }

    /// Who sent it back and when, over QA's notes: "Lena · 1 d".
    private var qaNotesByline: String? {
        guard let failed = detail?.history.first(where: { $0.kind == .state && ($0.to ?? "").lowercased().contains("failed") }) else { return nil }
        return "\(CommentAuthor.displayName(failed.by).name) · \(CompactTime.ago(failed.at))"
    }

    /// The markdown field, or the plain-text field from a server that sends no markdown.
    private func richText(_ section: ItemSection) -> String {
        guard let detail else { return "" }
        if let markdown = detail.markdown {
            switch section {
            case .qaNotes: return markdown.qaNotes
            case .description: return markdown.description
            case .reproSteps: return markdown.reproSteps
            case .acceptance: return markdown.acceptanceCriteria
            case .developerNotes: return markdown.developerNotes
            default: return ""
            }
        }
        switch section {
        case .qaNotes: return PlainText.clean(detail.qaNotes)
        case .description: return PlainText.clean(detail.description)
        case .reproSteps: return PlainText.clean(detail.reproSteps)
        case .acceptance: return PlainText.clean(detail.acceptanceCriteria)
        default: return ""
        }
    }

    private func available() -> Set<ItemSection> {
        var sections: Set<ItemSection> = [.details, .activity]
        for section in [ItemSection.qaNotes, .description, .reproSteps, .acceptance, .developerNotes] where !richText(section).isEmpty {
            sections.insert(section)
        }
        if !pullRequests.isEmpty { sections.insert(.pullRequests) }
        if !openThreads.isEmpty { sections.insert(.agents) }
        return sections
    }

    private func agentAsks(_ item: WorkItemSummary) -> Bool {
        openThreads.contains { [.question, .plan, .approval].contains($0.status) }
    }

    /// Every linked pull request, its own first; an older server sends only the overview's one.
    private var pullRequests: [ItemPullRequest] {
        if let linked = detail?.pullRequests, !linked.isEmpty { return linked }
        guard let pr = entry?.pullRequest else { return [] }
        return [ItemPullRequest(number: pr.number, url: pr.url, branch: pr.branch, state: pr.state, title: pr.title, isDraft: pr.isDraft,
                                checks: pr.checks, repository: nil, own: true, shared: false, author: nil, updatedAt: nil)]
    }

    // MARK: Jumping

    private func jump(to id: String, sections: [ItemSection], jumps: [JumpBar.Item]) {
        guard let top = sectionTops[id] else { return }
        jumpedAt = .now
        selection = Self.chip(for: sections.firstIndex { $0.id == id }, sections: sections, jumps: jumps)
        pinned = id
        withAnimation(.snappy) { position.scrollTo(y: max(0, top - Self.jumpBarHeight)) }
    }

    /// The chip follows the section under the jump bar; past a section without a chip (pull requests, agents) the next
    /// chip is selected, and the last one at the bottom of the page.
    private func follow(_ jumps: [JumpBar.Item], sections: [ItemSection]) {
        guard Date.now.timeIntervalSince(jumpedAt) > 0.6 else { return }
        guard headerGone else {
            selection = nil
            return
        }
        let line = scroll.top + Self.jumpBarHeight + 8
        let onScreen = sections.indices.first { index in
            index + 1 == sections.count || (sectionTops[sections[index + 1].id] ?? .infinity) > line
        }
        let current = scroll.atBottom ? jumps.last?.id : Self.chip(for: onScreen, sections: sections, jumps: jumps)
        if selection != current { selection = current }
    }

    /// The chip for a section: its own, or the next one for a section without a chip.
    private static func chip(for index: Int?, sections: [ItemSection], jumps: [JumpBar.Item]) -> String? {
        guard let index else { return nil }
        let chips = Set(jumps.map(\.id))
        return sections[index...].first { chips.contains($0.id) }?.id
    }

    // MARK: Bottom bar, composer and menu

    private func bottomBar(_ item: WorkItemSummary) -> some View {
        HStack(spacing: 10) {
            Menu {
                ForEach(item.workflow.filter { $0 != item.state }, id: \.self) { state in
                    Button(state) { app.router.present(.launch(.move(itemId: item.id, to: state, title: item.title))) }
                }
            } label: {
                Text("Move to…")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(BD.text)
                    .padding(.horizontal, 20)
                    .frame(height: 52)
            }
            .glassEffect(.regular.interactive(), in: Capsule())
            .accessibilityIdentifier("item-move")
            Button {
                app.router.present(.launch(LaunchContext(itemId: item.id, threadId: openThreads.first?.id, title: item.title)))
            } label: {
                Label("Fix with agent", systemImage: "sparkle")
            }
            .buttonStyle(.bd(.primary, height: 52))
            .accessibilityIdentifier("item-ask-agent")
        }
        .padding(.horizontal, 16)
        .padding(.top, 28)
        .padding(.bottom, 6)
        .background {
            LinearGradient(colors: [BD.bg.opacity(0), BD.bg.opacity(0.92), BD.bg], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        }
    }

    /// "Comment on AB#61021…": posts a markdown comment as you. It never changes a state.
    private func composer(_ item: WorkItemSummary) -> some View {
        let canSend = !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !posting
        return HStack(alignment: .bottom, spacing: 10) {
            TextField("Comment on AB#\(String(item.id))…", text: $draft, axis: .vertical)
                .font(.system(size: 16))
                .lineLimit(1...5)
                .padding(.vertical, 15)
                .accessibilityIdentifier("item-comment")
            Button { Task { await post(item) } } label: {
                Group {
                    if posting { ProgressView().tint(.white) } else { Image(systemName: "arrow.up").font(.system(size: 17, weight: .bold)) }
                }
                .foregroundStyle(.white)
                .frame(width: 42, height: 42)
                .background(canSend ? BD.accent : BD.text3, in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
            .padding(.bottom, 6)
            .accessibilityLabel("Send comment")
        }
        .padding(.leading, 20)
        .padding(.trailing, 6)
        .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 27, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.top, 28)
        .padding(.bottom, 6)
        .background {
            LinearGradient(colors: [BD.bg.opacity(0), BD.bg.opacity(0.92), BD.bg], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        }
    }

    private func post(_ item: WorkItemSummary) async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !posting else { return }
        posting = true
        defer { posting = false }
        do {
            posted.append(try await app.api.postItemComment(itemId: item.id, text: text))
            draft = ""
        } catch {
            app.report(error)
        }
    }

    private var moreMenu: some View {
        Menu {
            if let item {
                Button { UIPasteboard.general.string = "AB#\(item.id)" } label: { Label("Copy AB#\(String(item.id))", systemImage: "doc.on.doc") }
                if let url = URL(string: item.url) {
                    Button { openURL(url) } label: { Label("Open in Azure DevOps", systemImage: "arrow.up.right.square") }
                }
                if let entry {
                    if entry.queuedAt == nil {
                        Button { Task { await app.queue(itemId: item.id) } } label: { Label("Add to Up next", systemImage: "star") }
                    } else {
                        Button { Task { await app.unqueue(itemId: item.id) } } label: { Label("Remove from Up next", systemImage: "star.slash") }
                    }
                }
                ForEach(openThreads) { thread in
                    Button(role: .destructive) {
                        Task { if await app.account.authorize("Settle the thread") { await app.settle(thread) } }
                    } label: { Label(openThreads.count == 1 ? "Settle thread" : "Settle \(thread.title)", systemImage: "checkmark.circle") }
                }
            }
        } label: { Image(systemName: "ellipsis") }
        .accessibilityLabel("More")
    }

    // MARK: Navigation

    private func open(_ pr: ItemPullRequest) {
        if let key = PrKey(pullRequestURL: pr.url) {
            app.router.push(.pullRequest(key))
        } else if let url = URL(string: pr.url) {
            openURL(url)
        }
    }

    /// An agent row opens its pull request; on its own item there is nowhere else to go, so it stays.
    private func openAgent(_ thread: ThreadSummary) {
        if let pr = app.pullRequest(for: thread) { app.router.push(.pullRequest(pr.prKey)) }
    }
}

/// Where the page is scrolled: the top of what shows under the bars, and whether it reached the end.
private struct ScrollSpot: Equatable {
    let top: CGFloat
    let atBottom: Bool
    /// The height between the bars, so Activity can always scroll up to the jump bar.
    let visibleHeight: CGFloat
}

/// `-BorgDockRoute item/<id>/<section>` (DEBUG screenshots): jumps once the section is laid out.
private struct DebugJump: Equatable {
    let target: String?
    let ready: Bool
}

extension PrKey {
    /// https://github.com/owner/repo/pull/12
    init?(pullRequestURL githubURL: String) {
        guard let url = URL(string: githubURL), url.host()?.hasSuffix("github.com") == true else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count >= 4, parts[2] == "pull", let number = Int(parts[3]) else { return nil }
        self.init(owner: parts[0], repo: parts[1], number: number)
    }
}

/// ADO rich text from a server that sends no markdown: bold survives as markdown, list items as bullets, other HTML goes.
enum PlainText {
    static func clean(_ text: String) -> String {
        var result = text
        if result.contains("<") {
            result = result
                .replacingOccurrences(of: "</?(b|strong)>", with: "**", options: [.regularExpression, .caseInsensitive])
                .replacingOccurrences(of: "<br\\s*/?>|</p>|</div>|</li>", with: "\n", options: [.regularExpression, .caseInsensitive])
                .replacingOccurrences(of: "<li>", with: "• ", options: .caseInsensitive)
                .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        }
        for (entity, character) in ["&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'"] {
            result = result.replacingOccurrences(of: entity, with: character)
        }
        return result
            .replacingOccurrences(of: "\n{3,}", with: "\n\n", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
