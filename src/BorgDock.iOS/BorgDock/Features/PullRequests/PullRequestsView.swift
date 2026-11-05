import SwiftUI

/// The desktop's Pull requests tab: every open pull request the server reads, not only the ones that need you.
/// Filter pills, a search field, grouped by status, author or repository; swipes to review, merge or snooze.
struct PullRequestsView: View {
    @Environment(AppModel.self) private var app
    @AppStorage("prs.grouping") private var grouping: PrListGrouping = .status
    @AppStorage(PrSwipeHint.key) private var swipeHintSeen = false
    @AppStorage("prs.sort") private var sort: PrListSort = .updated
    @AppStorage("prs.hideDrafts") private var hideDrafts = false
    @State private var filter: PrListFilter = .all
    @State private var search = ""

    private var query: PrListQuery {
        PrListQuery(filter: filter, grouping: grouping, sort: sort, search: search, hideDrafts: hideDrafts)
    }

    var body: some View {
        let store = app.focus
        List {
            if let focus = store.focus {
                let groups = query.groups(focus.pullRequests)
                Section {
                    if groups.isEmpty { empty.listRowBackground(Color.clear).listRowSeparator(.hidden) }
                } header: {
                    pills(focus.pullRequests)
                        .textCase(nil)
                        .padding(.horizontal, -20)
                        .padding(.bottom, 2)
                }
                ForEach(groups) { group in
                    Section {
                        ForEach(group.pullRequests) { pr in row(pr, showsAuthor: group.author == nil) }
                    } header: {
                        PrGroupHeader(group: group)
                    }
                }
                if !groups.isEmpty, !swipeHintSeen {
                    Text(PrSwipeHint.text)
                        .font(.system(size: 14))
                        .foregroundStyle(BD.text3)
                        .lineSpacing(2)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 4, leading: 6, bottom: 4, trailing: 6))
                }
            } else if let error = store.error {
                ContentUnavailableView {
                    Label("Can't load pull requests", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await store.load(reportErrors: true) } }.buttonStyle(.bordered)
                }
                .listRowBackground(Color.clear)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 80).listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(4)
        .scrollContentBackground(.hidden)
        .background(BD.bg)
        .navigationTitle("Pull requests")
        .navigationSubtitle(subtitle(store.focus))
        .searchable(text: $search, prompt: "Title, branch, author, AB#")
        .toolbar { toolbar }
        .refreshable { await store.load(reportErrors: true) }
        .overlay(alignment: .bottom) { ApprovalToast().padding(.bottom, 8) }
        .tint(BD.text)
        .task { await store.poll() }
    }

    /// A group by author names the author in its header; every other group shows who wrote each row.
    private func row(_ pr: PrSummary, showsAuthor: Bool) -> some View {
        Button { app.router.push(.pullRequest(pr.prKey)) } label: { PrListRow(pr: pr, showsAuthor: showsAuthor) }
            .buttonStyle(.plain)
            .listRowInsets(EdgeInsets())
            .listRowBackground(BD.card)
            .alignmentGuide(.listRowSeparatorLeading) { _ in showsAuthor ? 58 : 14 }
            .contextMenu { PrContextMenu(pr: pr) } preview: { PrCard(pr: pr).frame(width: 370).environment(app) }
            .prSwipeActions(pr, app: app)
            .accessibilityIdentifier("pr-row-\(pr.key)")
    }

    private func subtitle(_ focus: Focus?) -> String {
        guard let prs = focus?.pullRequests else { return "" }
        let repos = Set(prs.map { "\($0.owner)/\($0.repo)" }).count
        return "\(prs.count) open in \(repos == 1 ? "1 repository" : "\(repos) repositories")"
    }

    private func pills(_ prs: [PrSummary]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(PrListFilter.allCases) { option in
                    Button {
                        withAnimation(.snappy) { filter = option }
                    } label: {
                        BucketPill(title: option.title, count: query.count(option, in: prs), selected: filter == option)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(filter == option ? .isSelected : [])
                    .accessibilityIdentifier("prs-filter-\(option.rawValue)")
                }
            }
        }
        .scrollClipDisabled()
    }

    private var empty: some View {
        VStack(spacing: 8) {
            Image(systemName: search.isEmpty ? "checkmark.circle" : "magnifyingglass").font(.system(size: 30)).foregroundStyle(search.isEmpty ? BD.green : BD.text3)
            Text(search.isEmpty ? "No pull requests here" : "No matches").font(.headline).foregroundStyle(BD.text)
            Text(search.isEmpty ? "Pull to refresh, or pick another filter." : "Try another word, or clear the filter.").font(.subheadline).foregroundStyle(BD.text2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Picker(selection: $grouping) {
                    ForEach(PrListGrouping.allCases) { Text($0.title).tag($0) }
                } label: {
                    Label("Group by", systemImage: "square.stack.3d.up")
                }
                .pickerStyle(.menu)
                Picker(selection: $sort) {
                    ForEach(PrListSort.allCases) { Text($0.title).tag($0) }
                } label: {
                    Label("Sort by", systemImage: "arrow.up.arrow.down")
                }
                .pickerStyle(.menu)
                Toggle("Hide drafts", systemImage: "doc.badge.ellipsis", isOn: $hideDrafts)
                Divider()
                Button("Refresh", systemImage: "arrow.clockwise") { Task { await app.focus.load(reportErrors: true) } }
            } label: {
                Image(systemName: "line.3.horizontal.decrease").foregroundStyle(BD.text)
            }
            .accessibilityLabel("View options")
            .accessibilityIdentifier("prs-options")
        }
    }
}

/// A group's header: the author's avatar or a repository glyph, the name and how many.
private struct PrGroupHeader: View {
    let group: PrListGroup

    var body: some View {
        HStack(spacing: 8) {
            if group.id == PrListQuery.needsYouGroupId {
                Image(systemName: "scope").foregroundStyle(BD.yellow)
            } else if group.id == "status:ready" {
                Image(systemName: "arrow.triangle.merge").foregroundStyle(BD.green)
            } else if group.id.hasPrefix("status:") {
                Image(systemName: group.id == "status:stale" ? "moon.zzz" : "clock").foregroundStyle(BD.text3)
            } else if let author = group.author {
                PersonAvatar(name: author.displayName, size: 20)
            } else if group.id.hasPrefix("repo:") {
                Image(systemName: "folder").foregroundStyle(BD.text3)
            }
            Text(group.title).lineLimit(1)
            Spacer(minLength: 8)
            Text("\(group.pullRequests.count)").monospacedDigit().foregroundStyle(BD.text3)
        }
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(BD.text2)
        .textCase(nil)
    }
}

/// A pull request in the list: denser than a Focus card. Repository and number, title, check bar, chips, diff stat.
struct PrListRow: View {
    let pr: PrSummary
    /// Grouped by author the header already names who wrote it.
    var showsAuthor = true

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if showsAuthor {
                PersonAvatar(name: pr.author.displayName, size: 32).padding(.top, 2)
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 5) {
                    Text(pr.repo).fontWeight(.semibold).foregroundStyle(BD.text2)
                    Text(pr.repoLabel).foregroundStyle(BD.text3)
                    Spacer(minLength: 8)
                    Text(ShortTime.age(pr.updatedAt)).foregroundStyle(BD.text3)
                }
                .font(.system(size: 13))
                .lineLimit(1)

                Text(pr.title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(pr.isDraft ? BD.text2 : BD.text)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)

                ViewThatFits(in: .horizontal) {
                    statusRow(workItem: true, diff: true)
                    statusRow(workItem: false, diff: true)
                    statusRow(workItem: false, diff: false)
                    PrTrackView(steps: pr.track, compact: true)
                }
                .padding(.top, 4)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func statusRow(workItem: Bool, diff: Bool) -> some View {
        HStack(spacing: 8) {
            PrTrackView(steps: pr.track)
            if workItem, let id = pr.workItemIds.first { ToneChip(text: "AB#\(id)", small: true, accent: true) }
            Spacer(minLength: 4)
            if diff { DiffStat(additions: pr.additions, deletions: pr.deletions) }
        }
    }
}

/// Checks → Review → Merge, each a mark and a word, so a row shows where the pull request is stuck.
struct PrTrackView: View {
    let steps: [PrTrackStep]
    /// Marks only, for narrow rows.
    var compact = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                if index > 0 {
                    Capsule().fill(step.mark == .done && steps[index - 1].mark == .done ? BD.green : BD.fill2).frame(width: compact ? 6 : 9, height: 2)
                }
                HStack(spacing: 4) {
                    mark(step.mark)
                    if !compact { Text(step.label).lineLimit(1) }
                }
                .foregroundStyle(color(step.mark))
            }
        }
        .font(.system(size: 12, weight: .semibold))
        .fixedSize()
        .accessibilityElement()
        .accessibilityLabel(steps.map(\.label).joined(separator: ", "))
    }

    @ViewBuilder
    private func mark(_ mark: PrTrackStep.Mark) -> some View {
        switch mark {
        case .done: filled("checkmark", BD.green)
        case .failed: filled("xmark", BD.red)
        case .attention: filled("exclamationmark", BD.yellow)
        case .running: ring(BD.blue, dot: true)
        case .yours: ring(BD.accent, dot: true)
        case .open: ring(BD.text3, dot: false)
        }
    }

    private func filled(_ symbol: String, _ color: Color) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 7.5, weight: .black))
            .foregroundStyle(BD.card)
            .frame(width: 15, height: 15)
            .background(color, in: Circle())
    }

    private func ring(_ color: Color, dot: Bool) -> some View {
        Circle()
            .strokeBorder(color, lineWidth: dot ? 2 : 1.5)
            .frame(width: 15, height: 15)
            .overlay { if dot { Circle().fill(color).frame(width: 5, height: 5) } }
    }

    private func color(_ mark: PrTrackStep.Mark) -> Color {
        switch mark {
        case .done: BD.green
        case .failed: BD.red
        case .attention: BD.yellow
        case .running: BD.blue
        case .yours: BD.accentText
        case .open: BD.text3
        }
    }
}
