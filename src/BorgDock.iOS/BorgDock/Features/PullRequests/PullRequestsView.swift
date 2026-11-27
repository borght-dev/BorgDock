import SwiftUI

/// The desktop's Pull requests list on the phone: its tabs and saved views, its query as chips, its groupings and
/// orders; swipes to review, merge or snooze. Mockup: design/ios-pr-list/mockups.html.
struct PullRequestsView: View {
    @Environment(AppModel.self) private var app
    @AppStorage(PrListStore.Keys.folded) private var folds = GroupFolds()
    @AppStorage(PrSwipeHint.key) private var swipeHintSeen = false
    /// What the search field holds; qualifiers typed to the end move to the query (`PrSearchTyping`).
    @State private var searchText = ""
    /// The last query the field wrote, so a query set elsewhere (a chip, a view) refills the field.
    @State private var queryFromField: String?
    @State private var sheet: Sheet?
    @State private var renaming: SavedPrView?
    @State private var newName = ""
    @State private var accountTroubles: [AccountTrouble] = []

    enum Sheet: Identifiable {
        case display
        case filter(QueryField?)
        case saveView

        var id: String {
            switch self {
            case .display: "display"
            case .filter(let field): "filter-\(field?.rawValue ?? "")"
            case .saveView: "save-view"
            }
        }
    }

    var body: some View {
        let store = app.focus
        let list = app.prList
        List {
            if let focus = store.focus {
                let context = PrListContext(focus: focus, list: list, logins: store.myLogins, ciGroups: store.ciGroups)
                let model = context.model
                if app.isReview { reviewReadNotices(focus, trouble: store.trouble) }
                Section {
                    if model.rows.isEmpty { empty(model).listRowBackground(Color.clear).listRowSeparator(.hidden) }
                } header: {
                    VStack(alignment: .leading, spacing: 0) {
                        repositoriesLink(focus.pullRequests)
                        pills(model)
                        chips(model, context: context)
                        statusBar(model, total: context.facts.count)
                        listBar(model.groups)
                    }
                    .textCase(nil)
                    .padding(.horizontal, -36)
                    .padding(.top, -20)
                }
                ForEach(GroupRun.runs(model.groups) { isFolded($0) }) { run in
                    switch run {
                    case .folded(let folded): foldedSection(folded)
                    case .open(let group): section(group, all: focus.pullRequests)
                    }
                }
                if !model.rows.isEmpty, !swipeHintSeen, canActOnRows {
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
        .searchable(text: $searchText, prompt: "Title, branch, author, AB#, or author:…")
        .searchSuggestions { suggestions }
        .onChange(of: searchText) { _, typed in absorb(typed) }
        .onChange(of: list.query, initial: true) { _, query in
            guard query != queryFromField else { return }
            searchText = ParsedQuery(parsing: query).text
            queryFromField = query
        }
        .toolbar { toolbar }
        .refreshable {
            async let pullRequests: Void = store.load(reportErrors: true, fresh: true)
            async let views: Void = list.sync()
            _ = await (pullRequests, views)
        }
        .overlay(alignment: .bottom) { ApprovalToast().padding(.bottom, 8) }
        .sheet(item: $sheet) { sheet in
            switch sheet {
            case .display: PrDisplaySheet()
            case .filter(let field): PrFilterSheet(startField: field)
            case .saveView: PrSaveViewSheet()
            }
        }
        .alert("Rename view", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Name", text: $newName)
            Button("Cancel", role: .cancel) {}
            Button("Rename") { if let renaming { list.renameView(renaming.id, to: newName) } }
        }
        .tint(BD.text)
        .task { await store.poll() }
        .task { await list.sync() }
        .task(id: store.focus?.generatedAt) {
            if let direct = app.direct { accountTroubles = await direct.gitHub.accountTroubles() }
        }
        #if DEBUG
        .task {
            guard let sheet = PrListDebugRoute.opens else { return }
            PrListDebugRoute.opens = nil
            self.sheet = sheet
        }
        #endif
    }

    // MARK: - Search

    /// Qualifiers typed to the end become filters; the word being typed stays out of the query until it is done.
    private func absorb(_ typed: String) {
        let list = app.prList
        let absorbed = PrSearchTyping.absorb(typed)
        var parsed = ParsedQuery(parsing: list.query)
        parsed.terms += absorbed.terms
        parsed.text = absorbed.text
        let query = parsed.formatted
        queryFromField = query
        list.setQuery(query)
        if !absorbed.terms.isEmpty { searchText = absorbed.field }
    }

    @ViewBuilder
    private var suggestions: some View {
        if let focus = app.focus.focus {
            let context = PrListContext(focus: focus, list: app.prList, logins: app.focus.myLogins, ciGroups: app.focus.ciGroups)
            ForEach(PrSearchTyping.suggestions(searchText, facts: context.tabFacts, ctx: context.ctx)) { suggestion in
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(suggestion.label).foregroundStyle(BD.text)
                        Text(suggestion.detail).font(.system(size: 12.5, design: .monospaced)).foregroundStyle(BD.text2)
                    }
                    Spacer()
                    if let count = suggestion.count { Text("\(count)").monospacedDigit().foregroundStyle(BD.text2) }
                }
                .searchCompletion(suggestion.completion)
            }
        }
    }

    // MARK: - Groups

    private func isFolded(_ group: PrGroupNode) -> Bool {
        PrGroups.isFolded(group, folds: folds, collapseQuiet: app.prList.display.collapseQuiet)
    }

    private func toggle(_ group: PrGroupNode) {
        withAnimation(.snappy) { folds.toggle(group.key, byDefault: app.prList.display.collapseQuiet && group.quiet) }
    }

    /// Folded groups next to each other share one card, a row each.
    private func foldedSection(_ groups: [PrGroupNode]) -> some View {
        Section {
            ForEach(groups) { group in
                Button { toggle(group) } label: { FoldedGroupRow(group: group) }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(BD.card)
                    .alignmentGuide(.listRowSeparatorLeading) { _ in 66 }
                    .accessibilityIdentifier("prs-group-\(group.key)")
            }
        }
    }

    @ViewBuilder
    private func section(_ group: PrGroupNode, all: [PrSummary]) -> some View {
        if group.kind == .none, !group.pinned, group.subgroups.isEmpty {
            Section { rows(group.facts, namesAuthor: false) }
        } else {
            Section {
                if group.subgroups.isEmpty {
                    rows(group.facts, namesAuthor: group.kind == .author && !group.pinned)
                } else {
                    ForEach(group.subgroups) { sub in
                        let folded = isFolded(sub)
                        Button { toggle(sub) } label: { SubgroupHeader(group: sub, folded: folded) }
                            .buttonStyle(.plain)
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(BD.card)
                            .listRowSeparator(folded ? .visible : .hidden, edges: .bottom)
                            .accessibilityIdentifier("prs-group-\(sub.key)")
                        if !folded { rows(sub.facts, namesAuthor: sub.kind == .author) }
                    }
                }
            } header: {
                OpenGroupHeader(group: group, reviewAll: reviewAll(group, all: all)) { toggle(group) }
            }
        }
    }

    private func rows(_ facts: [PrFacts], namesAuthor: Bool) -> some View {
        let sortBy = app.prList.display.sortBy
        let canAct = canActOnRows
        return ForEach(facts) { f in
            let pr = f.pr
            Button { app.router.push(.pullRequest(pr.prKey)) } label: {
                PrListRow(pr: pr, showsAuthor: !namesAuthor, age: ShortTime.age(sortBy == .updated ? pr.updatedAt : pr.createdAt), ci: f.ci)
            }
            .buttonStyle(.plain)
            .listRowInsets(EdgeInsets())
            .listRowBackground(BD.card)
            .alignmentGuide(.listRowSeparatorLeading) { _ in namesAuthor ? 14 : 58 }
            .contextMenu { PrContextMenu(pr: pr, canAct: canAct) } preview: { PrCard(pr: pr).frame(width: 370).environment(app) }
            .prSwipeActions(pr, app: app, enabled: canAct)
            .accessibilityIdentifier("pr-row-\(pr.key)")
        }
    }

    /// Review all: the author's run (the same as the long-press item), when the group is someone else's and the run
    /// may have anything in it. Pull requests whose E2E report isn't read yet count until the run reads it.
    private func reviewAll(_ group: PrGroupNode, all: [PrSummary]) -> OpenGroupHeader.ReviewAll? {
        guard canActOnRows, group.kind == .author, !group.pinned, !group.authorIsMe, let author = group.author else { return nil }
        let world = app.focus.runWorld
        let plan = AuthorRun.plan(AuthorRun.candidates(all, author: author.login, myLogins: app.focus.myLogins), fit: world.fit)
        let count = plan.queue.count + plan.checking.count
        guard count > 0 else { return nil }
        let title = count == group.facts.count ? "Review all \(count)" : "Review \(count)"
        return OpenGroupHeader.ReviewAll(title: title) { app.router.reviewAuthor(author.login) }
    }

    private var canActOnRows: Bool { !app.isReview || app.focus.trouble == nil }

    @ViewBuilder
    private func reviewReadNotices(_ focus: Focus, trouble: ListTrouble?) -> some View {
        Group {
            if let trouble {
                PrListReadBanner(trouble: trouble, generatedAt: focus.generatedAt) { app.router.present(.settings) }
            } else {
                ForEach(accountTroubles) { trouble in
                    PrListReadBanner(account: trouble, known: app.direct?.credentials.gitHub.first { $0.id == trouble.id }) {
                        app.router.present(.settings)
                    }
                }
            }
        }
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }

    // MARK: - Header

    /// The built-in tabs, then the saved views with a bookmark; a view's long-press renames, moves or deletes it.
    private func pills(_ model: PrListModel) -> some View {
        let list = app.prList
        let selectedPill = list.activeViewId ?? list.view.rawValue
        return ScrollViewReader { proxy in ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(PrViewKey.allCases) { key in
                    let selected = list.activeViewId == nil && list.view == key
                    Button { withAnimation(.snappy) { list.showBuiltIn(key) } } label: {
                        BucketPill(title: key.pillLabel, count: model.counts[key] ?? 0, selected: selected)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                    .accessibilityIdentifier("prs-filter-\(key.rawValue)")
                    .id(key.rawValue)
                }
                ForEach(Array(list.savedViews.enumerated()), id: \.element.id) { index, saved in
                    let selected = list.activeViewId == saved.id
                    Button { withAnimation(.snappy) { list.showSaved(saved.id) } } label: {
                        SavedViewPill(name: saved.name, count: model.savedCounts[saved.id] ?? 0, selected: selected)
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button("Rename", systemImage: "pencil") {
                            newName = saved.name
                            renaming = saved
                        }
                        if index > 0 { Button("Move left", systemImage: "arrow.left") { list.moveView(saved.id, by: -1) } }
                        if index < list.savedViews.count - 1 { Button("Move right", systemImage: "arrow.right") { list.moveView(saved.id, by: 1) } }
                        Button("Delete", systemImage: "trash", role: .destructive) { list.deleteView(saved.id) }
                    }
                    .accessibilityAddTraits(selected ? .isSelected : [])
                    .accessibilityIdentifier("prs-view-\(saved.id)")
                    .id(saved.id)
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollClipDisabled()
        .onChange(of: selectedPill, initial: true) { _, id in withAnimation(.snappy) { proxy.scrollTo(id, anchor: .center) } }
        }
        .padding(.top, 14)
    }

    /// Filter (with how many filters are on), then one chip per filter: tap to change it, × to drop it.
    private func chips(_ model: PrListModel, context: PrListContext) -> some View {
        let list = app.prList
        let terms = model.parsed.terms
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Button { sheet = .filter(nil) } label: { FilterChipButton(count: terms.count) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("prs-filter-sheet")
                ForEach(Array(terms.enumerated()), id: \.offset) { index, term in
                    let chip = PrFacets.chip(term, name: context.name)
                    FilterChip(field: chip.field, op: chip.op, values: chip.values, tap: { sheet = .filter(term.field) }) {
                        withAnimation(.snappy) { list.setQuery(PrQuery.removeTerm(list.query, at: index)) }
                    }
                    .accessibilityIdentifier("prs-chip-\(index)")
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollClipDisabled()
        .padding(.top, 10)
    }

    /// A built-in tab with filters: how many are left, Save view, Clear. A saved view you changed: Save as new, Update.
    @ViewBuilder
    private func statusBar(_ model: PrListModel, total: Int) -> some View {
        let list = app.prList
        if list.activeView != nil, list.activeViewIsEdited {
            HStack(spacing: 8) {
                Text("Edited").fontWeight(.semibold).foregroundStyle(BD.text)
                Button("Revert") { withAnimation(.snappy) { list.revertActiveView() } }
                    .foregroundStyle(BD.text2)
                    .accessibilityIdentifier("prs-view-revert")
                Spacer(minLength: 8)
                Button("Save as new") { sheet = .saveView }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("prs-view-save-new")
                Button("Update") { list.updateActiveView() }
                    .buttonStyle(.borderedProminent)
                    .tint(BD.accent)
                    .accessibilityIdentifier("prs-view-update")
            }
            .font(.system(size: 13.5, weight: .semibold))
            .controlSize(.small)
            .padding(.horizontal, 20)
            .padding(.top, 10)
        } else if list.activeView == nil, !list.query.trimmingCharacters(in: .whitespaces).isEmpty {
            HStack(spacing: 14) {
                Text("\(model.rows.count) of \(total)").monospacedDigit()
                Group {
                    Button { sheet = .saveView } label: { Label("Save view", systemImage: "bookmark").labelStyle(TightLabelStyle(spacing: 4)) }
                        .accessibilityIdentifier("prs-save-view")
                    Button("Clear") { withAnimation(.snappy) { list.setQuery(PrQuery.clearTerms(list.query)) } }
                        .accessibilityIdentifier("prs-clear-filters")
                }
                .fontWeight(.semibold)
                .foregroundStyle(BD.accentText)
                Spacer(minLength: 0)
            }
            .buttonStyle(.plain)
            .font(.system(size: 13))
            .foregroundStyle(BD.text2)
            .padding(.horizontal, 20)
            .padding(.top, 9)
        }
    }

    /// "≡ By status, then repository · priority" (opens Display) and Fold all.
    private func listBar(_ groups: [PrGroupNode]) -> some View {
        let display = app.prList.display
        let keys = groups.flatMap { [$0] + $0.subgroups }.map(\.key)
        let allFolded = !groups.isEmpty && groups.allSatisfy(isFolded)
        let grouped = display.groupBy != .none
        return HStack(spacing: 6) {
            Button { sheet = .display } label: {
                Label { listBarText(display) } icon: {
                    Image(systemName: "square.3.layers.3d").font(.system(size: 13, weight: .medium))
                }
                .labelStyle(TightLabelStyle(spacing: 6))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("prs-list-bar")
            Spacer(minLength: 8)
            if grouped, !groups.isEmpty {
                Button(allFolded ? "Unfold all" : "Fold all") {
                    withAnimation(.snappy) { allFolded ? folds.open(keys) : folds.fold(groups.map(\.key)) }
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

    private func listBarText(_ display: PrDisplay) -> Text {
        let bold = { (s: String) in Text(s).fontWeight(.semibold).foregroundStyle(BD.text) }
        let order = bold(display.sortBy.label.lowercased())
        guard display.groupBy != .none else { return Text("Not grouped · \(order)") }
        let group = bold(display.groupBy.label.lowercased())
        guard display.subGroupBy != .none, display.subGroupBy != display.groupBy else { return Text("By \(group) · \(order)") }
        return Text("By \(group), then \(bold(display.subGroupBy.label.lowercased())) · \(order)")
    }

    private func empty(_ model: PrListModel) -> some View {
        let filtered = !app.prList.query.trimmingCharacters(in: .whitespaces).isEmpty
        return VStack(spacing: 8) {
            Image(systemName: filtered ? "magnifyingglass" : "checkmark.circle").font(.system(size: 30)).foregroundStyle(filtered ? BD.text3 : BD.green)
            Text(filtered ? "No matches" : "No pull requests here").font(.headline).foregroundStyle(BD.text)
            Text(filtered ? "Try another word, or clear the filters." : "Pull to refresh, or pick another tab.").font(.subheadline).foregroundStyle(BD.text2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button { sheet = .display } label: {
                Image(systemName: "slider.horizontal.3").foregroundStyle(BD.text)
            }
            .accessibilityLabel("Display")
            .accessibilityIdentifier("prs-display")
        }
        if app.isReview {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Settings", systemImage: "person.crop.circle") { app.router.present(.settings) }
                    .accessibilityIdentifier("open-settings")
            }
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

/// Everything a screen of the list derives from Focus and the list's state, built once per render.
@MainActor
struct PrListContext {
    let facts: [PrFacts]
    let ctx: PrQuery.Context
    let list: PrListStore
    private let people: [String: Person]

    init(focus: Focus, list: PrListStore, logins: Set<String>, ciGroups: [CiFailureGroup] = [], now: Date = .now) {
        let lower = Set(logins.map { $0.lowercased() })
        facts = PrListModel.facts(focus, logins: lower, now: now, ciGroups: ciGroups)
        ctx = PrQuery.Context(logins: lower, now: now)
        self.list = list
        people = Dictionary(focus.pullRequests.map { ($0.author.login.lowercased(), $0.author) }, uniquingKeysWith: { a, _ in a })
    }

    var model: PrListModel {
        PrListModel(.init(facts: facts, logins: ctx.logins, now: ctx.now, view: list.view, query: list.query, hideFailing: list.hideFailing, display: list.display, savedViews: list.savedViews))
    }

    /// The tab's pull requests under every filter: what search suggests from.
    var tabFacts: [PrFacts] { PrListModel.matching(facts, view: list.view, query: list.query, hideFailing: list.hideFailing, ctx: ctx) }

    /// The tab's pull requests under every filter but `field`'s: what a Filter field counts its values in.
    func facts(except field: QueryField, query: String) -> [PrFacts] {
        PrListModel.matching(facts, view: list.view, query: query, hideFailing: list.hideFailing, ctx: ctx, except: field)
    }

    /// How many pull requests `query` leaves in the tab.
    func count(_ query: String) -> Int {
        PrListModel.matching(facts, view: list.view, query: query, hideFailing: list.hideFailing, ctx: ctx).count
    }

    /// A login's name for a chip: "You" for yours.
    func name(_ login: String) -> String? {
        if login == "me" || login == "@me" || ctx.logins.contains(login) { return "You" }
        return people[login]?.displayName
    }
}

/// A saved view's pill: a bookmark, its name and its count.
private struct SavedViewPill: View {
    let name: String
    let count: Int
    let selected: Bool

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: selected ? "bookmark.fill" : "bookmark").font(.system(size: 12, weight: .semibold))
            Text(name).lineLimit(1)
            Text("\(count)").monospacedDigit().foregroundStyle(selected ? BD.bg.opacity(0.65) : BD.text2)
        }
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(selected ? BD.bg : BD.text)
        .padding(.horizontal, 13)
        .frame(height: 34)
        .background(selected ? BD.text : BD.fill, in: Capsule())
    }
}

/// "Filter" with how many filters are on.
private struct FilterChipButton: View {
    let count: Int

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "line.3.horizontal.decrease").font(.system(size: 13, weight: .bold))
            Text("Filter")
            if count > 0 {
                Text("\(count)")
                    .font(.system(size: 11, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(BD.onAccent)
                    .padding(.horizontal, 5)
                    .frame(minWidth: 18, minHeight: 18)
                    .background(BD.accent, in: Capsule())
            }
        }
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(BD.accentText)
        .padding(.leading, 9)
        .padding(.trailing, 11)
        .frame(height: 30)
        .background(BD.accentSoft, in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(count > 0 ? "Filter, \(count) on" : "Filter")
    }
}

/// "Checks is not failing ×".
private struct FilterChip: View {
    let field: String
    let op: String
    let values: String
    let tap: () -> Void
    let remove: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Button(action: tap) {
                (Text(field).fontWeight(.semibold).foregroundStyle(BD.text) + Text(" \(op) ") + Text(values).fontWeight(.semibold).foregroundStyle(BD.text))
                    .lineLimit(1)
            }
            .buttonStyle(.plain)
            Button(action: remove) {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .heavy))
                    .foregroundStyle(BD.text2)
                    .frame(width: 20, height: 20)
                    .background(BD.fill, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove \(field) filter")
        }
        .font(.system(size: 13))
        .foregroundStyle(BD.text2)
        .padding(.leading, 11)
        .padding(.trailing, 5)
        .frame(height: 30)
        .background(BD.card, in: Capsule())
        .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
    }
}

/// A group inside a group: fold chevron, name, count.
private struct SubgroupHeader: View {
    let group: PrGroupNode
    let folded: Bool

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: folded ? "chevron.right" : "chevron.down").font(.system(size: 11, weight: .bold)).foregroundStyle(BD.text3)
            Text(group.displayTitle).lineLimit(1)
            Text("\(group.facts.count)").monospacedDigit().foregroundStyle(BD.text3)
            Spacer(minLength: 0)
        }
        .font(.system(size: 12.5, weight: .semibold))
        .foregroundStyle(BD.text2)
        .padding(.horizontal, 14)
        .padding(.top, 9)
        .padding(.bottom, 6)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint(folded ? "Shows the group" : "Folds the group")
    }
}

extension PrGroupNode {
    /// An author group reads "You" or the author's name; the others their label.
    var displayTitle: String {
        if kind == .author, !pinned, let author { return authorIsMe ? "You" : author.displayName }
        return label
    }
}

/// The groups you folded or opened yourself, kept as one line each ("-id" folded, "+id" opened); a group you never
/// touched follows the view's default.
struct GroupFolds: RawRepresentable, Equatable {
    private(set) var folded: Set<String>
    private(set) var opened: Set<String>

    init(folded: Set<String> = [], opened: Set<String> = []) {
        self.folded = folded
        self.opened = opened
    }

    /// Lines without a sign come from builds that only stored folded groups.
    init(rawValue: String) {
        var folded: Set<String> = [], opened: Set<String> = []
        for line in rawValue.split(separator: "\n").map(String.init) {
            if line.hasPrefix("+") { opened.insert(String(line.dropFirst())) }
            else if line.hasPrefix("-") { folded.insert(String(line.dropFirst())) }
            else { folded.insert(line) }
        }
        self.init(folded: folded, opened: opened)
    }

    var rawValue: String { (folded.map { "-\($0)" } + opened.map { "+\($0)" }).sorted().joined(separator: "\n") }

    func isFolded(_ id: String, byDefault: Bool) -> Bool {
        folded.contains(id) || (byDefault && !opened.contains(id))
    }

    mutating func toggle(_ id: String, byDefault: Bool) {
        isFolded(id, byDefault: byDefault) ? open([id]) : fold([id])
    }

    mutating func fold(_ ids: [String]) {
        folded.formUnion(ids)
        opened.subtract(ids)
    }

    mutating func open(_ ids: [String]) {
        opened.formUnion(ids)
        folded.subtract(ids)
    }
}

/// A folded group: who or what it is, what needs attention in it, and how many.
private struct FoldedGroupRow: View {
    let group: PrGroupNode

    var body: some View {
        HStack(spacing: 10) {
            GroupGlyph(group: group, size: 30)
            VStack(alignment: .leading, spacing: 1) {
                Text(group.displayTitle).font(.system(size: 15.5, weight: .semibold)).foregroundStyle(BD.text).lineLimit(1)
                summary.font(.system(size: 12.5)).foregroundStyle(BD.text2).lineLimit(1)
            }
            Spacer(minLength: 8)
            Text("\(group.facts.count)").font(.system(size: 16, weight: .semibold)).monospacedDigit().foregroundStyle(BD.text2)
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
        PrGroupSummary.parts(group.facts).enumerated().reduce(Text("")) { text, entry in
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

    let group: PrGroupNode
    let reviewAll: ReviewAll?
    let fold: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(action: fold) {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.down").font(.system(size: 12, weight: .bold)).foregroundStyle(BD.text3)
                    GroupGlyph(group: group, size: 20)
                    Text(group.displayTitle).lineLimit(1)
                    Text("\(group.facts.count)").monospacedDigit().foregroundStyle(BD.text3)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Folds the group")
            .accessibilityIdentifier("prs-group-\(group.key)")
            Spacer(minLength: 8)
            if let reviewAll {
                Button(action: reviewAll.start) {
                    Label(reviewAll.title, systemImage: "eye").labelStyle(TightLabelStyle(spacing: 4))
                }
                .buttonStyle(.plain)
                .foregroundStyle(BD.accentText)
                .accessibilityIdentifier("prs-review-all-\(group.key)")
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

/// The group's face: the author's avatar (yours on the accent), or a glyph for its grouping or status.
private struct GroupGlyph: View {
    let group: PrGroupNode
    let size: CGFloat

    var body: some View {
        if group.pinned {
            symbol("scope", BD.accentText)
        } else if group.kind == .author, let author = group.author {
            if group.authorIsMe { MeAvatar(size: size) } else { PersonAvatar(name: author.displayName, size: size) }
        } else if let bucket = group.bucket {
            symbol(bucket.symbol, bucket.color)
        } else {
            symbol(group.kind.symbol, BD.text2)
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

private extension PrStatusBucket {
    var symbol: String {
        switch self {
        case .yourTurn: "scope"
        case .failing: "xmark.octagon"
        case .waiting: "clock"
        case .ready: "arrow.triangle.merge"
        case .draft: "pencil.line"
        }
    }

    var color: Color {
        switch self {
        case .yourTurn: BD.accentText
        case .failing: BD.red
        case .ready: BD.green
        case .waiting, .draft: BD.text2
        }
    }
}

private extension PrGroupBy {
    var symbol: String {
        switch self {
        case .repo: "folder"
        case .review: "checkmark.bubble"
        case .waiting: "hourglass"
        case .workItem: "number"
        case .label: "tag"
        case .base: "arrow.triangle.branch"
        case .age: "calendar"
        case .size: "ruler"
        case .status, .author, .none: "arrow.triangle.pull"
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
    /// What the related CI failures say about its red checks: the desktop's shared-failure marker.
    var ci: PrCiFacts?

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
                    HStack(spacing: 8) {
                        PrTrackView(steps: pr.track, compact: true)
                        sharedMarker
                    }
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

    @ViewBuilder
    private var sharedMarker: some View {
        if let ci { ToneChip(text: ci.markerText(base: pr.baseRef), tone: ci.outside ? .warn : .bad, small: true) }
    }

    private func statusRow(workItem: Bool, diff: Bool) -> some View {
        HStack(spacing: 8) {
            PrTrackView(steps: pr.track)
            sharedMarker
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
/// `-BorgDockRoute prs/display | prs/filter | prs/filter/<field> | prs/save | prs/repositories | prs/query/<query> |
/// prs/view/<id>[/<added query>] | prs/open/<group key>`: the list's screenshot states.
@MainActor
enum PrListDebugRoute {
    static var opens: PullRequestsView.Sheet?

    static func apply(_ value: String, to app: AppModel) async {
        switch value {
        case "display":
            opens = .display
            app.router.tab = .pullRequests
        case "filter":
            opens = .filter(nil)
            app.router.tab = .pullRequests
        case let value where value.hasPrefix("filter/"):
            opens = .filter(QueryField(rawValue: String(value.dropFirst(7))))
            app.router.tab = .pullRequests
        case "save":
            opens = .saveView
            app.router.tab = .pullRequests
        case "repositories":
            app.router.open(.repositories, in: .pullRequests)
        case let value where value.hasPrefix("view/"):
            await app.prList.sync()
            let parts = value.dropFirst(5).split(separator: "/", maxSplits: 1).map(String.init)
            app.prList.showSaved(parts[0])
            if parts.count > 1 { app.prList.setQuery(app.prList.query + " " + (parts[1].removingPercentEncoding ?? "")) }
            app.router.tab = .pullRequests
        case let value where value.hasPrefix("query/"):
            app.prList.showBuiltIn(.all)
            app.prList.setQuery(String(value.dropFirst(6)).removingPercentEncoding ?? "")
            app.router.tab = .pullRequests
        case let value where value.hasPrefix("open/"):
            for _ in 0..<40 where app.focus.focus == nil { try? await Task.sleep(for: .milliseconds(250)) }
            guard let focus = app.focus.focus else { return }
            let keys = PrListContext(focus: focus, list: app.prList, logins: app.focus.myLogins, ciGroups: app.focus.ciGroups).model.groups.map(\.key)
            let open = String(value.dropFirst(5))
            UserDefaults.standard.set(GroupFolds(folded: Set(keys).subtracting([open]), opened: [open]).rawValue, forKey: PrListStore.Keys.folded)
            app.router.tab = .pullRequests
        default:
            break
        }
    }
}
#endif
