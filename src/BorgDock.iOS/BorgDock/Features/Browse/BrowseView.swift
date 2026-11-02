import SwiftUI

/// ADO beyond My work: pick a saved query or search, then queue or start what you find.
struct BrowseView: View {
    @Environment(AppModel.self) private var app
    @State private var queries: [BrowseQuery] = []
    @State private var queryId = "sprint"
    @State private var searchText = ""
    @State private var activeSearch: String?
    @State private var result: BrowseResult?
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var showPicker = false
    @FocusState private var searchFocused: Bool

    private var selectedQuery: BrowseQuery? { queries.first { $0.id == queryId } }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    results
                }
                .padding(.bottom, 24)
            }
        }
        .scrollDismissesKeyboard(.immediately)
        .background(Palette.console)
        .refreshable { await reload() }
        .navigationTitle("Browse")
        
        .deepStatusBar()
        .task {
            if queries.isEmpty { await loadQueries() }
            if result == nil { await run() }
        }
        .sheet(isPresented: $showPicker) {
            QueryPicker(queries: queries, selectedId: queryId, onRefresh: reload) { picked in
                queryId = picked.id
                activeSearch = nil
                searchText = ""
                Task { await run() }
            }
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 16) {
            searchField
            HStack(spacing: 8) {
                Button { showPicker = true } label: {
                    HStack(spacing: 8) {
                        Text(selectedQuery?.name ?? "Current sprint, whole team").lineLimit(1)
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.down").font(.system(size: 10))
                    }
                    .appFont(12, weight: .regular, relativeTo: .caption)
                    .foregroundStyle(Palette.text)
                    .padding(11)
                    .background(Palette.paper, in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line))
                }
                .buttonStyle(.plain)
                .disabled(queries.isEmpty)
                Button("Refresh") { Task { await reload() } }
                    .buttonStyle(.paper(.secondary))
                    .disabled(isLoading)
            }
            Text(activeSearch.map { "Search: \($0)" } ?? selectedQuery?.name ?? "Current sprint, whole team")
                .appFont(26, weight: .semibold, relativeTo: .title)
                .foregroundStyle(Palette.text)
                .padding(.top, 8)
        }
        .padding(.horizontal, 18)
        .padding(.top, 22)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
            TextField("", text: $searchText, prompt: Text("Search titles or type an item number").foregroundStyle(Palette.muted))
                .font(.subheadline)
                .foregroundStyle(Palette.text)
                .focused($searchFocused)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onSubmit(submitSearch)
            if !searchText.isEmpty || activeSearch != nil {
                Button {
                    searchText = ""
                    if activeSearch != nil {
                        activeSearch = nil
                        Task { await run() }
                    }
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.muted)
                }
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 6).fill(Palette.panel))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(searchFocused ? Palette.Signal.next : Palette.line))
    }

    private func submitSearch() {
        let text = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty {
            activeSearch = nil
        } else if let id = Int(text.trimmingCharacters(in: CharacterSet(charactersIn: "#ABab "))) {
            app.router.push(ItemRoute(id: id))
            return
        } else {
            activeSearch = text
        }
        Task { await run() }
    }

    // MARK: Results

    @ViewBuilder
    private var results: some View {
        VStack(alignment: .leading, spacing: 5) {
            if let result {
                HStack(spacing: 8) {
                    Text(summary(result))
                        .font(.footnote)
                        .foregroundStyle(Palette.muted)
                    Spacer(minLength: 8)
                    if isLoading { ProgressView().tint(Palette.muted).controlSize(.small) }
                }
                .padding(.horizontal, 4)
                .padding(.bottom, 6)
                ForEach(result.items) { item in
                    BrowseStrip(item: item, entry: app.itemOverview(item.id)) {
                        app.router.push(ItemRoute(id: item.id, prefill: item))
                    }
                }
            } else if let errorMessage {
                Notice(text: errorMessage, color: Palette.Signal.waiting)
            } else {
                HStack(spacing: 10) {
                    ProgressView().tint(Palette.muted)
                    Text("Asking ADO").foregroundStyle(Palette.muted)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 50)
            }
            if result != nil, let errorMessage {
                Notice(text: errorMessage, color: Palette.Signal.waiting).padding(.top, 8)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 16)
    }

    private func summary(_ result: BrowseResult) -> String {
        let count = result.items.count
        let items = count == 1 ? "1 item" : "\(count) items"
        if count == 0 { return "Nothing matches." }
        return result.truncated ? "\(items). ADO has more; narrow the query to see them." : items + " open."
    }

    private func loadQueries() async {
        do {
            queries = try await app.api.browseQueries()
        } catch {
            if (error as? APIError)?.isUnauthorized == true { app.report(error) }
        }
    }

    /// Pull to refresh: the saved queries and the current query or search, fresh from the server.
    /// What's on screen stays until the new answer arrives; failures show as a toast.
    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        let fresh = await app.reloadBrowse(query: queryId, search: activeSearch)
        if let queries = fresh.queries { self.queries = queries }
        if let result = fresh.result {
            self.result = result
            errorMessage = nil
        }
    }

    private func run() async {
        isLoading = true
        defer { isLoading = false }
        do {
            result = try await app.api.browse(query: queryId, search: activeSearch)
            errorMessage = nil
        } catch is CancellationError {
            return
        } catch {
            if (error as? APIError)?.isUnauthorized == true { app.report(error); return }
            errorMessage = error.localizedDescription
        }
    }
}

/// A Browse result: lamp shows the bay when it's already in My work.
private struct BrowseStrip: View {
    let item: WorkItemSummary
    let entry: ItemOverview?
    let onOpen: () -> Void

    @Environment(AppModel.self) private var app

    var body: some View {
        StripFrame(tint: Palette.paperHi, lamp: entry?.bay.lamp ?? .clear) {
            StripHolder(label: String(item.id), kind: item.typeAndPriority)
        } content: {
            StripTitle(title: WorkflowRules.shortTitle(item.title))
            StripState(text: item.state)
            FlowLayout(spacing: 6) {
                if let due = DueDate(item) {
                    Text(due.label + (due.overdue ? ", overdue" : ""))
                        .appFont(11, weight: .regular, relativeTo: .caption)
                        .foregroundStyle(due.overdue ? Palette.inkRed : Palette.muted)
                }
                if let sprint = item.sprintLabel {
                    Text(sprint).appFont(11, weight: .regular, relativeTo: .caption).foregroundStyle(Palette.muted)
                }
            }
            HStack(spacing: 8) {
                Text(item.assignedToMe ? "You" : item.assignedTo ?? "Unassigned")
                    .font(.caption)
                    .italic(item.assignedTo == nil)
                    .foregroundStyle(Palette.inkSoft)
                    .lineLimit(1)
                Spacer(minLength: 8)
                if let thread = entry?.openThread {
                    Text("Agent in \(thread.worktree)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Palette.ink)
                } else {
                    if entry?.bay != .next {
                        Button("Queue") { Task { await app.queue(itemId: item.id) } }
                            .buttonStyle(.paper(.secondary, busy: app.isBusy("queue:\(item.id)")))
                    }
                    StartButton(item: item, fromBrowse: true)
                }
            }
            .padding(.top, 2)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onOpen)
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: "Open \(item.id)", onOpen)
    }
}

/// Every saved query, grouped the way ADO groups them.
private struct QueryPicker: View {
    let queries: [BrowseQuery]
    let selectedId: String
    let onRefresh: () async -> Void
    let onPick: (BrowseQuery) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var filter = ""

    private var groups: [(String, [BrowseQuery])] {
        let matching = filter.isEmpty ? queries : queries.filter {
            $0.name.localizedCaseInsensitiveContains(filter) || $0.group.localizedCaseInsensitiveContains(filter)
        }
        var order: [String] = []
        var byGroup: [String: [BrowseQuery]] = [:]
        for query in matching {
            if byGroup[query.group] == nil { order.append(query.group) }
            byGroup[query.group, default: []].append(query)
        }
        return order.map { ($0, byGroup[$0] ?? []) }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(groups, id: \.0) { group, queries in
                    Section(group) {
                        ForEach(queries) { query in
                            Button {
                                onPick(query)
                                dismiss()
                            } label: {
                                HStack {
                                    Text(query.name).foregroundStyle(Palette.text)
                                    Spacer()
                                    if query.id == selectedId {
                                        Image(systemName: "checkmark").foregroundStyle(Palette.Signal.next)
                                    }
                                }
                            }
                            .listRowBackground(Palette.panel)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Palette.console)
            .refreshable { await onRefresh() }
            .searchable(text: $filter, placement: .navigationBarDrawer(displayMode: .always), prompt: "Find a query")
            .navigationTitle("Queries")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .presentationBackground(Palette.console)
    }
}

/// A one-line warning in Browse.
struct Notice: View {
    let text: String
    let color: Color

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            LampDot(color: color, size: 6)
            Text(text).font(.footnote).foregroundStyle(Palette.text)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.panel, in: RoundedRectangle(cornerRadius: 8))
    }
}
