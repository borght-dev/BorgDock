import SwiftUI

/// One work item: the verdict leads, then its fields, the description, its pull request and agent, and the newest
/// message from ADO comments, Developer Notes or the agent. "Move to…" and "Ask an agent" both start a run:
/// BorgDock never changes an ADO state on a button.
struct ItemDetailView: View {
    let route: ItemRoute

    @Environment(AppModel.self) private var app
    @Environment(\.openURL) private var openURL
    @State private var detail: ItemDetail?
    @State private var loadError: String?

    private var entry: ItemOverview? { app.itemOverview(route.id) }
    private var item: WorkItemSummary? { entry?.item ?? detail?.item ?? route.prefill }
    private var thread: ThreadSummary? { entry?.currentThread }

    var body: some View {
        ScrollView {
            if let item {
                content(item)
                    .padding(.bottom, 110)
            } else if let loadError {
                StatusCard(icon: "exclamationmark.triangle", text: loadError, tone: .warn)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
            }
        }
        .background(BD.bg)
        .safeAreaInset(edge: .bottom) { if let item { bottomBar(item) } }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            if let item, let url = URL(string: item.url) {
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
                loadError = nil
            }
        }
    }

    private func load() async {
        do {
            detail = try await app.api.item(route.id)
            loadError = nil
        } catch is CancellationError {
        } catch {
            if (error as? APIError)?.isUnauthorized == true { app.report(error); return }
            loadError = error.localizedDescription
        }
    }

    // MARK: Content

    @ViewBuilder
    private func content(_ item: WorkItemSummary) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 7) {
                    WorkItemGlyph(typeName: item.typeName, size: 12)
                    Text("\(item.type.label(typeName: item.typeName)) · AB#\(String(item.id))")
                    Spacer(minLength: 8)
                    ToneChip(text: item.state, tone: item.stateCategory == .inProgress ? .run : item.stateCategory == .completed ? .ok : .mute)
                }
                .font(.system(size: 14))
                .foregroundStyle(BD.text2)
                Text(item.title)
                    .font(.system(size: 25, weight: .bold))
                    .tracking(-0.4)
                    .foregroundStyle(BD.text)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                if let entry, let banner = ItemBanner(entry: entry) {
                    VerdictBanner(banner: banner).padding(.top, 8)
                }
            }
            .padding(.horizontal, 16)
            fields(item)
            if let detail {
                let description = PlainText.clean(detail.description.isEmpty ? detail.reproSteps : detail.description)
                if !description.isEmpty {
                    Text(ChatMarkdown.inline(description, size: 16))
                        .font(.system(size: 16))
                        .lineSpacing(3)
                        .foregroundStyle(BD.text)
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                        .textSelection(.enabled)
                }
            }
            linkedWork(item)
            latest
            moreText
        }
        .padding(.top, 4)
    }

    private func fields(_ item: WorkItemSummary) -> some View {
        let due = DueDate(item)
        let cells: [(String, String, Bool)] = [
            ("Assigned to", item.assignedToMe ? "You" : item.assignedTo ?? "Nobody", true),
            ("Sprint", item.sprint.isEmpty ? "None" : item.sprint, false),
            ("Priority", item.priority.map(String.init) ?? "None", false),
            due.map { ("Due", $0.label.replacingOccurrences(of: "Due ", with: ""), false) } ?? ("Type", item.type.longName(typeName: item.typeName), false),
        ]
        return Grid(horizontalSpacing: 0.5, verticalSpacing: 0.5) {
            ForEach(0..<2) { row in
                GridRow {
                    ForEach(0..<2) { column in
                        let cell = cells[row * 2 + column]
                        VStack(alignment: .leading, spacing: 2) {
                            Text(cell.0).font(.system(size: 13)).foregroundStyle(BD.text3)
                            HStack(spacing: 6) {
                                if cell.2, let name = item.assignedTo { PersonAvatar(name: name, size: 22) }
                                Text(cell.1).font(.system(size: 16, weight: .medium)).foregroundStyle(BD.text).lineLimit(1)
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(BD.card)
                    }
                }
            }
        }
        .background(BD.separator)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.top, 14)
    }

    @ViewBuilder
    private func linkedWork(_ item: WorkItemSummary) -> some View {
        let pullRequest = entry?.pullRequest
        let thread = self.thread
        if pullRequest != nil || thread != nil {
            CellGroupHeader(title: [pullRequest != nil ? "Pull request" : nil, thread != nil ? "agent" : nil].compactMap { $0 }.joined(separator: " · ").capitalizedFirst)
            CellGroup(indent: 52) {
                if let pullRequest {
                    Button { openPullRequest(pullRequest) } label: {
                        Cell(title: "#\(pullRequest.number) \(pullRequest.title)", subtitle: pullRequestLine(pullRequest), chevron: true) {
                            Image(systemName: pullRequest.state == .merged ? "arrow.triangle.merge" : "arrow.triangle.pull")
                                .font(.system(size: 19))
                                .foregroundStyle(pullRequest.state == .merged ? BD.merged : BD.green)
                                .frame(width: 24)
                        }
                    }
                    .buttonStyle(.plain)
                }
                if let thread {
                    Button { app.openThread(thread.id) } label: { AgentRow(thread: thread) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("item-thread")
                }
            }
        }
    }

    @ViewBuilder
    private var latest: some View {
        if let entry, let message = WalkDisplay.latest(for: entry) {
            CellGroupHeader(title: "Latest")
            CellGroup {
                HStack(alignment: .top, spacing: 12) {
                    PersonAvatar(name: message.by.components(separatedBy: " · ").first ?? message.by, size: 36)
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(message.by).font(.system(size: 16, weight: .medium)).foregroundStyle(BD.text)
                            Spacer(minLength: 8)
                            Text(CompactTime.ago(message.at)).font(.system(size: 14)).foregroundStyle(BD.text3)
                        }
                        Text(WalkDisplay.oneLine(message.text))
                            .font(.system(size: 15))
                            .foregroundStyle(BD.text2)
                            .lineLimit(6)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
        }
    }

    @ViewBuilder
    private var moreText: some View {
        if let detail {
            let sections = [("Acceptance criteria", detail.acceptanceCriteria), ("Repro steps", detail.description.isEmpty ? "" : detail.reproSteps), ("QA notes", detail.qaNotes)]
                .map { ($0.0, PlainText.clean($0.1)) }
                .filter { !$0.1.isEmpty }
            ForEach(sections, id: \.0) { title, text in
                CellGroupHeader(title: title)
                Text(text)
                    .font(.system(size: 15))
                    .foregroundStyle(BD.text)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .bdCard(radius: 20)
                    .padding(.horizontal, 16)
                    .textSelection(.enabled)
            }
            if detail.comments.count > 1 {
                CellGroupHeader(title: "Comments", trailing: String(detail.comments.count))
                CellGroup {
                    ForEach(Array(detail.comments.enumerated()), id: \.offset) { _, comment in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text(comment.by).font(.system(size: 15, weight: .medium))
                                Spacer()
                                Text(CompactTime.ago(comment.at)).font(.system(size: 13.5)).foregroundStyle(BD.text3)
                            }
                            Text(PlainText.clean(comment.text)).font(.system(size: 15)).foregroundStyle(BD.text2)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                }
            }
        }
    }

    // MARK: Bottom bar and menu

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
                    .padding(.horizontal, 22)
                    .frame(height: 52)
            }
            .glassEffect(.regular.interactive(), in: Capsule())
            .accessibilityIdentifier("item-move")
            Button {
                app.router.present(.launch(LaunchContext(itemId: item.id, threadId: thread?.status.isOpen == true ? thread?.id : nil, title: item.title)))
            } label: {
                Label("Ask an agent", systemImage: "cpu")
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

    private var moreMenu: some View {
        Menu {
            if let item {
                Button { UIPasteboard.general.string = "AB#\(item.id)" } label: { Label("Copy AB#\(String(item.id))", systemImage: "doc.on.doc") }
                if let entry {
                    if entry.queuedAt == nil {
                        Button { Task { await app.queue(itemId: item.id) } } label: { Label("Add to Up next", systemImage: "star") }
                    } else {
                        Button { Task { await app.unqueue(itemId: item.id) } } label: { Label("Remove from Up next", systemImage: "star.slash") }
                    }
                }
                if let thread, thread.status.isOpen {
                    Button(role: .destructive) {
                        Task { if await app.account.authorize("Settle the thread") { await app.settle(thread) } }
                    } label: { Label("Settle thread", systemImage: "checkmark.circle") }
                }
            }
        } label: { Image(systemName: "ellipsis") }
        .accessibilityLabel("More")
    }

    private func openPullRequest(_ pullRequest: PullRequest) {
        if let key = PrKey(pullRequestURL: pullRequest.url) {
            app.router.push(.pullRequest(key))
        } else if let url = URL(string: pullRequest.url) {
            openURL(url)
        }
    }

    private func pullRequestLine(_ pullRequest: PullRequest) -> String {
        [pullRequest.state.label, pullRequest.isDraft ? "draft" : nil, pullRequest.checks.map { "checks \($0.lowercased())" }]
            .compactMap { $0 }.joined(separator: " · ")
    }
}

/// The verdict as a sentence over the fields when it's bad or a warning: "CI red. #3712 fails …".
struct ItemBanner: Equatable {
    let title: String
    let text: String
    let tone: Tone

    init?(entry: ItemOverview) {
        let verdict = WalkDisplay.verdict(for: entry)
        guard verdict.tone == .bad || verdict.tone == .warn else { return nil }
        title = verdict.label
        tone = verdict.tone
        text = entry.suggestion?.reason ?? entry.waitingFor ?? WalkDisplay.latest(for: entry).map { WalkDisplay.oneLine($0.text) } ?? ""
    }
}

private struct VerdictBanner: View {
    let banner: ItemBanner

    var body: some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: banner.tone == .bad ? "xmark.circle" : "exclamationmark.triangle")
                .foregroundStyle(banner.tone.color)
                .padding(.top, 1)
            Text("\(Text("\(banner.title).").fontWeight(.semibold).foregroundStyle(banner.tone.color)) \(Text(banner.text).foregroundStyle(BD.text))")
                .lineLimit(4)
        }
        .font(.system(size: 15))
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(banner.tone.soft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
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

private extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}

/// ADO rich text arrives mostly as plain text; bold survives as markdown, other HTML is stripped.
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
