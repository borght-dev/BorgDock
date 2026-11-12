import SwiftUI

/// The desktop's Pull requests tab: every open pull request the server reads, not only the ones that need you.
/// Filter pills, a search field, groups that fold, the Display sheet; swipes to review, merge or snooze.
/// Mockup: design/ios-flow/mockups.html, section 03.
struct PullRequestsView: View {
    @Environment(AppModel.self) private var app
    @AppStorage(PrListFilter.storageKey) private var filter: PrListFilter = .all
    @AppStorage(PrListDisplayKeys.grouping) private var grouping: PrListGrouping = .author
    @AppStorage(PrListDisplayKeys.sort) private var sort: PrListSort = .waiting
    @AppStorage(PrListDisplayKeys.mineFirst) private var mineFirst = true
    @AppStorage(PrListDisplayKeys.showDrafts) private var showDrafts = true
    @AppStorage(PrListDisplayKeys.dependenciesTogether) private var dependenciesTogether = true
    @AppStorage(PrListDisplayKeys.folded) private var folded = FoldedGroups()
    @AppStorage(PrSwipeHint.key) private var swipeHintSeen = false
    @State private var search = ""
    @State private var showingDisplay = false

    private var query: PrListQuery {
        PrListQuery(
            filter: filter, grouping: grouping, sort: sort, search: search, mineFirst: mineFirst, showDrafts: showDrafts,
            dependenciesTogether: dependenciesTogether, myLogins: app.focus.myLogins
        )
    }

    var body: some View {
        let store = app.focus
        List {
            if let focus = store.focus {
                let groups = query.groups(focus.pullRequests)
                Section {
                    if groups.isEmpty { empty.listRowBackground(Color.clear).listRowSeparator(.hidden) }
                } header: {
                    VStack(alignment: .leading, spacing: 0) {
                        repositoriesLink(focus.pullRequests)
                        pills(focus.pullRequests)
                        listBar(groups)
                    }
                    .textCase(nil)
                    .padding(.horizontal, -36)
                    .padding(.top, -20)
                }
                ForEach(groups) { group in
                    section(group, all: focus.pullRequests)
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
        .listSectionSpacing(12)
        .scrollContentBackground(.hidden)
        .background(BD.bg)
        .navigationTitle("Pull requests")
        .searchable(text: $search, prompt: "Title, branch, author, AB#")
        .toolbar { toolbar }
        .refreshable { await store.load(reportErrors: true) }
        .overlay(alignment: .bottom) { ApprovalToast().padding(.bottom, 8) }
        .sheet(isPresented: $showingDisplay) {
            PrDisplaySheet(grouping: $grouping, sort: $sort, mineFirst: $mineFirst, showDrafts: $showDrafts, dependenciesTogether: $dependenciesTogether)
        }
        .tint(BD.text)
        .task { await store.poll() }
        #if DEBUG
        .task {
            guard PrListDebugRoute.opensDisplay else { return }
            PrListDebugRoute.opensDisplay = false
            showingDisplay = true
        }
        #endif
    }

    // MARK: - Groups

    @ViewBuilder
    private func section(_ group: PrListGroup, all: [PrSummary]) -> some View {
        if grouping == .flat {
            Section { rows(group) }
        } else if folded.contains(group.id) {
            Section {
                Button { withAnimation(.snappy) { folded.toggle(group.id) } } label: { FoldedGroupRow(group: group) }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(BD.card)
                    .accessibilityIdentifier("prs-group-\(group.id)")
            }
        } else {
            Section {
                rows(group)
            } header: {
                OpenGroupHeader(group: group, reviewAll: reviewAll(group, all: all)) {
                    withAnimation(.snappy) { folded.toggle(group.id) }
                }
            }
        }
    }

    private func rows(_ group: PrListGroup) -> some View {
        ForEach(group.pullRequests) { pr in
            Button { app.router.push(.pullRequest(pr.prKey)) } label: {
                PrListRow(pr: pr, showsAuthor: !group.namesAuthor, age: ShortTime.age(sort.shownDate(pr)))
            }
            .buttonStyle(.plain)
            .listRowInsets(EdgeInsets())
            .listRowBackground(BD.card)
            .alignmentGuide(.listRowSeparatorLeading) { _ in group.namesAuthor ? 14 : 58 }
            .contextMenu { PrContextMenu(pr: pr) } preview: { PrCard(pr: pr).frame(width: 370).environment(app) }
            .prSwipeActions(pr, app: app)
            .accessibilityIdentifier("pr-row-\(pr.key)")
        }
    }

    /// Review all: the author's run, when the group is someone else's and the run has anything in it.
    private func reviewAll(_ group: PrListGroup, all: [PrSummary]) -> OpenGroupHeader.ReviewAll? {
        guard case .author(let author, mine: false) = group.kind else { return nil }
        let queue = AuthorRun.queue(all, author: author.login, myLogins: app.focus.myLogins)
        guard !queue.isEmpty else { return nil }
        let title = queue.count == group.pullRequests.count ? "Review all \(queue.count)" : "Review \(queue.count)"
        return OpenGroupHeader.ReviewAll(title: title) { app.router.review(queue.map(\.prKey)) }
    }

    // MARK: - Header

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
            .padding(.horizontal, 16)
        }
        .scrollClipDisabled()
        .padding(.top, 14)
    }

    /// "≡ By author · waiting longest" (opens Display) and Fold all.
    private func listBar(_ groups: [PrListGroup]) -> some View {
        let ids = groups.map(\.id)
        let allFolded = !ids.isEmpty && ids.allSatisfy(folded.contains)
        return HStack(spacing: 6) {
            Button { showingDisplay = true } label: {
                Label {
                    Text(grouping == .flat
                         ? "Not grouped · \(Text(sort.title.lowercased()).fontWeight(.semibold).foregroundStyle(BD.text))"
                         : "By \(Text(grouping.title.lowercased()).fontWeight(.semibold).foregroundStyle(BD.text)) · \(Text(sort.title.lowercased()).fontWeight(.semibold).foregroundStyle(BD.text))")
                } icon: {
                    Image(systemName: "square.3.layers.3d").font(.system(size: 13, weight: .medium))
                }
                .labelStyle(TightLabelStyle(spacing: 6))
            }
            .buttonStyle(.plain)
            Spacer(minLength: 8)
            if grouping != .flat, !ids.isEmpty {
                Button(allFolded ? "Unfold all" : "Fold all") {
                    withAnimation(.snappy) { folded = allFolded ? FoldedGroups() : FoldedGroups(ids: folded.ids.union(ids)) }
                }
                .fontWeight(.semibold)
                .foregroundStyle(BD.accentText)
                .buttonStyle(.plain)
                .accessibilityIdentifier("prs-fold-all")
            }
        }
        .font(.system(size: 13))
        .foregroundStyle(BD.text2)
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 2)
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

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button { showingDisplay = true } label: {
                Image(systemName: "slider.horizontal.3").foregroundStyle(BD.text)
            }
            .accessibilityLabel("Display")
            .accessibilityIdentifier("prs-display")
        }
    }

    /// "143 open in 16 repositories" under the title; it opens which repositories the server reads. A toolbar subtitle
    /// can't take a tap, so it leads the list instead.
    private func repositoriesLink(_ prs: [PrSummary]) -> some View {
        let repositories = Set(prs.map { "\($0.owner)/\($0.repo)" }).count
        return Button { app.router.push(.repositories) } label: {
            Text("\(prs.count) open in \(repositories == 1 ? "1 repository" : "\(repositories) repositories")")
                .font(.system(size: 15))
                .foregroundStyle(BD.text2)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .padding(.top, 2)
        .accessibilityHint("Shows which repositories are read")
        .accessibilityIdentifier("prs-repositories")
    }
}

/// Where the list's display choices are kept, per device.
enum PrListDisplayKeys {
    static let grouping = "prs.grouping"
    static let sort = "prs.sort"
    static let mineFirst = "prs.mineFirst"
    static let showDrafts = "prs.showDrafts"
    static let dependenciesTogether = "prs.dependenciesTogether"
    static let folded = "prs.folded"
}

/// The ids of the groups you folded, kept as one line each.
struct FoldedGroups: RawRepresentable, Equatable {
    var ids: Set<String>

    init(ids: Set<String> = []) { self.ids = ids }
    init(rawValue: String) { ids = Set(rawValue.split(separator: "\n").map(String.init)) }
    var rawValue: String { ids.sorted().joined(separator: "\n") }

    func contains(_ id: String) -> Bool { ids.contains(id) }

    mutating func toggle(_ id: String) {
        if ids.remove(id) == nil { ids.insert(id) }
    }
}

/// A folded group: who or what it is, what needs attention in it, and how many.
private struct FoldedGroupRow: View {
    let group: PrListGroup

    var body: some View {
        HStack(spacing: 10) {
            GroupGlyph(group: group, size: 30)
            VStack(alignment: .leading, spacing: 1) {
                Text(group.title).font(.system(size: 15.5, weight: .semibold)).foregroundStyle(BD.text).lineLimit(1)
                summary.font(.system(size: 12.5)).foregroundStyle(BD.text2).lineLimit(1)
            }
            Spacer(minLength: 8)
            Text("\(group.pullRequests.count)").font(.system(size: 16, weight: .semibold)).monospacedDigit().foregroundStyle(BD.text2)
            CellChevron()
        }
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .frame(minHeight: 54)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Shows the group")
    }

    private var summary: Text {
        PrGroupSummary.parts(group.pullRequests).enumerated().reduce(Text("")) { text, entry in
            let part = Text(entry.element.text).foregroundStyle(entry.element.alert ? BD.red : BD.text2)
            return entry.offset == 0 ? part : Text("\(text) · \(part)")
        }
    }
}

/// An open group's header: fold chevron, who or what, how many, and Review all for someone else's pull requests.
private struct OpenGroupHeader: View {
    struct ReviewAll {
        let title: String
        let start: () -> Void
    }

    let group: PrListGroup
    let reviewAll: ReviewAll?
    let fold: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(action: fold) {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.down").font(.system(size: 12, weight: .bold)).foregroundStyle(BD.text3)
                    GroupGlyph(group: group, size: 20)
                    Text(group.title).lineLimit(1)
                    Text("\(group.pullRequests.count)").monospacedDigit().foregroundStyle(BD.text3)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Folds the group")
            .accessibilityIdentifier("prs-group-\(group.id)")
            Spacer(minLength: 8)
            if let reviewAll {
                Button(action: reviewAll.start) {
                    Label(reviewAll.title, systemImage: "eye").labelStyle(TightLabelStyle(spacing: 4))
                }
                .buttonStyle(.plain)
                .foregroundStyle(BD.accentText)
                .accessibilityIdentifier("prs-review-all-\(group.id)")
            }
        }
        .font(.system(size: 13.5, weight: .semibold))
        .foregroundStyle(BD.text2)
        .textCase(nil)
        .padding(.leading, -14)
        .padding(.trailing, -16)
        .padding(.top, 4)
    }
}

/// The group's face: the author's avatar (yours on the accent), or a glyph for a repository, a status or updates.
private struct GroupGlyph: View {
    let group: PrListGroup
    let size: CGFloat

    var body: some View {
        switch group.kind {
        case .author(_, mine: true): MeAvatar(size: size)
        case .author(let person, mine: false): PersonAvatar(name: person.displayName, size: size)
        case .repository: symbol("folder", BD.text2)
        case .status(let bucket): symbol(bucket.symbol, bucket.color)
        case .dependencies: symbol("shippingbox", BD.text2)
        case .all: symbol("arrow.triangle.pull", BD.text2)
        }
    }

    @ViewBuilder
    private func symbol(_ name: String, _ color: Color) -> some View {
        if size >= 30 {
            CellIcon(systemImage: name, color: color, soft: true)
        } else {
            Image(systemName: name).font(.system(size: 13, weight: .semibold)).foregroundStyle(color).frame(width: size, height: size)
        }
    }
}

private extension FocusBucket {
    var symbol: String {
        switch self {
        case .you: "scope"
        case .ready: "arrow.triangle.merge"
        case .wait: "clock"
        case .stale: "moon.zzz"
        }
    }

    var color: Color {
        switch self {
        case .you: BD.accentText
        case .ready: BD.green
        case .wait, .stale: BD.text2
        }
    }
}

/// A pull request in the list: repository, number and age, the title, then where it is stuck and its size.
struct PrListRow: View {
    let pr: PrSummary
    /// Grouped by author the header already names who wrote it.
    var showsAuthor = true
    /// "9 d": how long by the list's order, so the age explains the sort.
    var age: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if showsAuthor {
                PersonAvatar(name: pr.author.displayName, size: 32).padding(.top, 2)
            }
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Text(pr.repo).fontWeight(.semibold).foregroundStyle(BD.text)
                    Text(pr.repoLabel).foregroundStyle(BD.text2)
                    Spacer(minLength: 8)
                    Text(age).foregroundStyle(BD.text2)
                }
                .font(.system(size: 13))
                .lineLimit(1)

                Text(pr.title)
                    .font(.system(size: 15.5, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(pr.isDraft ? BD.text2 : BD.text)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 3)

                ViewThatFits(in: .horizontal) {
                    statusRow(workItem: true, diff: true)
                    statusRow(workItem: false, diff: true)
                    statusRow(workItem: false, diff: false)
                    PrTrackView(steps: pr.track, compact: true)
                }
                .padding(.top, 7)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 11)
        .padding(.bottom, 12)
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

#if DEBUG
/// `-BorgDockRoute prs/display | prs/repositories | prs/open/<group id>`: the list's screenshot states.
@MainActor
enum PrListDebugRoute {
    static var opensDisplay = false

    static func apply(_ value: String, to app: AppModel) async {
        switch value {
        case "display":
            opensDisplay = true
            app.router.tab = .pullRequests
        case "repositories":
            app.router.open(.repositories, in: .pullRequests)
        case let value where value.hasPrefix("open/"):
            for _ in 0..<40 where app.focus.focus == nil { try? await Task.sleep(for: .milliseconds(250)) }
            let defaults = UserDefaults.standard
            var query = PrListQuery(myLogins: app.focus.myLogins)
            query.grouping = defaults.string(forKey: PrListDisplayKeys.grouping).flatMap(PrListGrouping.init) ?? .author
            let ids = query.groups(app.focus.focus?.pullRequests ?? []).map(\.id)
            defaults.set(FoldedGroups(ids: Set(ids).subtracting([String(value.dropFirst(5))])).rawValue, forKey: PrListDisplayKeys.folded)
            app.router.tab = .pullRequests
        default:
            break
        }
    }
}
#endif
