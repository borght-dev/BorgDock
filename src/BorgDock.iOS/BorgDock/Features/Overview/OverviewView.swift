import SwiftUI

/// The Work tab, Dispatch's states walk made scannable: the briefing, scopes (Mine, the sprint, unassigned, Up next,
/// saved queries), Fix out of sync and Sync all, then one lane per state. Lanes that need you open; the others fold
/// into one card of summaries. Mockup: design/ios-flow, section 07.
struct OverviewView: View {
    @Environment(AppModel.self) private var app
    @AppStorage("work.scope") private var storedScope = WorkScope.mine.stored
    @AppStorage("work.grouping") private var grouping: WorkGrouping = .state
    @AppStorage("work.laneOrder") private var laneOrder = ""
    @AppStorage("work.folds") private var storedFolds = ""
    @State private var queries = WorkQueries()
    @State private var expanded: Set<String> = []
    @State private var showingScopes = false

    private var scope: WorkScope { WorkScope(stored: storedScope) }
    private var sprintName: String? { app.sprint.sprint?.name }

    private func scopeEntries(_ scope: WorkScope) -> [WorkEntry]? {
        let queryItems: [WorkItemSummary]? = if case .query(let id, _) = scope { queries.items[id] } else { nil }
        return WorkEntries.of(scope, overview: app.overview, sprint: app.sprint.sprint, queryItems: queryItems)
    }

    var body: some View {
        let scope = self.scope
        let entries = scopeEntries(scope)
        let lanes = entries.map { WorkLanes.build($0, walk: app.overview?.walk, grouping: grouping, order: LaneOrder.decode(laneOrder), currentSprint: sprintName) } ?? []
        ScrollViewReader { proxy in
            List {
                Section {
                    if let overview = app.overview { SourceWarnings(sources: overview.sources).listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
                } header: {
                    controls(scope)
                }
                if let entries {
                    lanesContent(lanes, folds: LaneFolds(stored: storedFolds))
                    if scope == .mine { agentsWithoutItem }
                    if entries.isEmpty { empty(scope) }
                } else {
                    loading(scope)
                }
            }
            .listStyle(.insetGrouped)
            .listSectionSpacing(0)
            .scrollContentBackground(.hidden)
            .background(BD.bg)
            .environment(\.defaultMinListRowHeight, 0)
            .task(id: DebugScroll(target: app.router.scrollTarget, ready: entries != nil)) { jump(to: app.router.scrollTarget, lanes: lanes, proxy: proxy) }
        }
        .refreshable { await refresh(scope, reportErrors: true) }
        .navigationTitle("Work")
        .navigationSubtitle(entries.map { "\(scope.title(sprint: sprintName)) · \($0.count)" } ?? scope.title(sprint: sprintName))
        .toolbar {
            ToolbarItem(placement: .largeSubtitle) {
                if let entries {
                    ToneSentence(parts: WorkBriefing.parts(entries))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier("walk-briefing")
                }
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { Task { await refresh(scope, reportErrors: true) } } label: { Image(systemName: "arrow.triangle.2.circlepath") }
                    .accessibilityLabel("Refresh from ADO and T3")
                Button { app.router.present(.launch(LaunchContext())) } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Start an agent")
            }
        }
        .tint(BD.text)
        .task(id: storedScope) { await load(scope) }
        .sheet(isPresented: $showingScopes) {
            WorkShowSheet(storedScope: $storedScope, grouping: $grouping, laneOrder: $laneOrder, queries: queries, count: { scopeEntries($0)?.count })
        }
    }

    // MARK: Header

    private func controls(_ scope: WorkScope) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(pillScopes(scope), id: \.self) { option in
                        Button { storedScope = option.stored } label: {
                            BucketPill(title: option.title(sprint: sprintName), count: scopeEntries(option)?.count, selected: option == scope)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(option == scope ? .isSelected : [])
                        .accessibilityIdentifier("work-scope-\(option.stored)")
                    }
                    Button { showingScopes = true } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(BD.text)
                            .frame(width: 40, height: 34)
                            .background(BD.fill, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Show")
                    .accessibilityIdentifier("work-show")
                }
            }
            .scrollClipDisabled()
            if let overview = app.overview { actions(overview) }
        }
        .textCase(nil)
        .padding(.horizontal, -20)
        .padding(.top, 6)
        .padding(.bottom, 2)
    }

    /// Mine, the sprint and its unassigned items, plus the scope you picked in the Show sheet when it's another one.
    private func pillScopes(_ current: WorkScope) -> [WorkScope] {
        let fixed: [WorkScope] = [.mine, .sprint, .unassigned]
        return fixed.contains(current) ? fixed : fixed + [current]
    }

    private func actions(_ overview: Overview) -> some View {
        let outOfSync = WalkDisplay.outOfSyncItemIds(overview)
        return HStack(spacing: 8) {
            if !outOfSync.isEmpty {
                Button {
                    app.router.present(.launch(.sync(itemIds: outOfSync, outOfSyncOnly: true)))
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 13, weight: .semibold))
                        Text("Fix out of sync")
                        Text(verbatim: "\(outOfSync.count)").opacity(0.7)
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(BD.yellow)
                    .padding(.horizontal, 13)
                    .frame(height: 34)
                    .background(BD.yellowSoft, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("fix-out-of-sync")
            }
            Button {
                app.router.present(.launch(.sync(itemIds: WalkDisplay.activeItemIds(overview), outOfSyncOnly: false)))
            } label: {
                Text("Sync all")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(BD.text)
                    .padding(.horizontal, 13)
                    .frame(height: 34)
                    .background(BD.fill, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: Lanes

    /// Open lanes in their order, then every folded lane together in one card.
    @ViewBuilder
    private func lanesContent(_ lanes: [WorkLane], folds: LaneFolds) -> some View {
        let showsState = grouping != .state
        ForEach(lanes.filter(folds.isOpen)) { lane in
            let rows = LaneRows.visible(lane, expanded: expanded.contains(lane.id), showsState: showsState)
            Section {
                ForEach(rows.shown) { entry in row(entry, showsState: showsState) }
                if !rows.hidden.isEmpty {
                    Button { withAnimation(.snappy) { _ = expanded.insert(lane.id) } } label: {
                        Text(LaneRows.moreLabel(rows.hidden))
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(BD.accentText)
                            .padding(.leading, 38)
                            .padding(.vertical, 12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(BD.card)
                }
            } header: {
                LaneHeader(lane: lane, open: true) { setOpen(lane, false) }
                    .id(lane.id)
            }
        }
        let folded = lanes.filter { !folds.isOpen($0) }
        if !folded.isEmpty {
            Section {
                ForEach(folded) { lane in
                    Button { setOpen(lane, true) } label: { FoldedLaneRow(lane: lane) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(BD.card)
                        .alignmentGuide(.listRowSeparatorLeading) { _ in 56 }
                        .accessibilityIdentifier("folded-\(lane.id)")
                        .id(lane.id)
                }
            } header: {
                Color.clear.frame(height: 0)
            }
        }
    }

    private func row(_ entry: WorkEntry, showsState: Bool) -> some View {
        Button { app.router.push(ItemRoute(id: entry.id, prefill: entry.item)) } label: { WorkRow(entry: entry, showsState: showsState) }
            .buttonStyle(.plain)
            .listRowInsets(EdgeInsets())
            .listRowBackground(BD.card)
            .alignmentGuide(.listRowSeparatorLeading) { _ in 16 }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button {
                    app.router.present(.launch(LaunchContext(itemId: entry.id, threadId: entry.overview?.openThread?.id, title: entry.item.title)))
                } label: { Label("Agent", systemImage: "cpu") }
                    .tint(BD.accent)
                Button {
                    Task { entry.overview?.queuedAt == nil ? await app.queue(itemId: entry.id) : await app.unqueue(itemId: entry.id) }
                } label: {
                    entry.overview?.queuedAt == nil ? Label("Up next", systemImage: "star") : Label("Not next", systemImage: "star.slash")
                }
                .tint(BD.yellow)
            }
            .accessibilityIdentifier("walk-item-\(entry.id)")
    }

    private func setOpen(_ lane: WorkLane, _ open: Bool) {
        var folds = LaneFolds(stored: storedFolds)
        folds.set(lane, open: open)
        withAnimation(.snappy) { storedFolds = folds.stored }
    }

    // MARK: Agents, empty and loading

    @ViewBuilder
    private var agentsWithoutItem: some View {
        if let unlinked = app.overview?.unlinkedThreads, !unlinked.isEmpty {
            Section {
                ForEach(unlinked) { thread in
                    Button { app.openThread(thread.id) } label: { AgentRow(thread: thread.thread, subject: thread.thread.branch) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(BD.card)
                        .alignmentGuide(.listRowSeparatorLeading) { _ in 37 }
                }
            } header: {
                HStack {
                    Text("Agents without an item")
                    Spacer()
                    Text(verbatim: "\(unlinked.count)").monospacedDigit()
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(BD.text2)
                .textCase(nil)
                .padding(.top, 14)
            }
        }
    }

    private func empty(_ scope: WorkScope) -> some View {
        let text = switch scope {
        case .mine: "Nothing assigned to you. Pick something from the sprint."
        case .upNext: "Nothing in Up next. Swipe an item to add it."
        default: "Nothing open here."
        }
        return StatusCard(icon: "checkmark.circle", text: text, tone: .ok)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
    }

    @ViewBuilder
    private func loading(_ scope: WorkScope) -> some View {
        let error = scope == .mine || scope == .upNext ? app.overviewError : (scope == .sprint || scope == .unassigned ? app.sprint.error : queries.error)
        Group {
            if let error {
                VStack(spacing: 0) {
                    StatusCard(icon: "exclamationmark.triangle", text: error, tone: .warn)
                    Button("Try again") { Task { await refresh(scope, reportErrors: true) } }
                        .buttonStyle(.bd(.plain, height: 44))
                        .padding(16)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
            }
        }
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
    }

    // MARK: Loading

    /// The sprint and saved queries load when a scope needs them; Mine is the overview the app polls anyway.
    private func load(_ scope: WorkScope) async {
        if app.sprint.sprint == nil { await app.sprint.load() }
        if queries.saved.isEmpty { await queries.loadSaved(app) }
        if case .query(let id, _) = scope, queries.items[id] == nil { await queries.load(id, app: app) }
    }

    private func refresh(_ scope: WorkScope, reportErrors: Bool) async {
        switch scope {
        case .mine, .upNext: await app.refreshFromSources()
        case .sprint, .unassigned: await app.sprint.load(reportErrors: reportErrors)
        case .query(let id, _): await queries.load(id, app: app, reportErrors: reportErrors)
        }
    }

    /// `-BorgDockRoute scroll/<lane>` (DEBUG screenshots): opens that lane and scrolls to it; `scroll/show` opens Show.
    private func jump(to target: String?, lanes: [WorkLane], proxy: ScrollViewProxy) {
        guard let target, app.router.tab == .work else { return }
        if target == "show" {
            showingScopes = true
        } else if let lane = lanes.first(where: { $0.id == target }) {
            setOpen(lane, true)
            Task {
                try? await Task.sleep(for: .milliseconds(300))
                proxy.scrollTo(lane.id, anchor: UnitPoint(x: 0.5, y: 0.14))
            }
        } else {
            return
        }
        app.router.scrollTarget = nil
    }
}

/// Re-runs the debug jump once the lanes exist.
private struct DebugScroll: Equatable {
    let target: String?
    let ready: Bool
}
