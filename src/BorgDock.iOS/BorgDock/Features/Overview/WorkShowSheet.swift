import SwiftUI

/// What the Work tab shows, from the chevron next to the scope pills: a search for any item, the scopes, your saved ADO
/// queries, how lanes group and their order. Replaces Browse. Mockup: design/ios-flow, section 07, frame 3.
struct WorkShowSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @Binding var storedScope: String
    @Binding var grouping: WorkGrouping
    @Binding var laneOrder: String
    let queries: WorkQueries
    let count: (WorkScope) -> Int?

    @State private var search = ""
    @State private var results: [WorkItemSummary]?
    @State private var searchError: String?
    @State private var editingOrder = false

    private var sprintName: String? { app.sprint.sprint?.name }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    searchField
                    searchResults
                    CellGroupHeader(title: "Scopes")
                    CellGroup {
                        ForEach([WorkScope.mine, .sprint, .unassigned, .upNext], id: \.self) { scope in
                            option(scope.longTitle(sprint: sprintName), count: count(scope), selected: scope.stored == storedScope) { pick(scope) }
                        }
                    }
                    if !queries.saved.isEmpty {
                        CellGroupHeader(title: "Saved queries in Azure DevOps")
                        CellGroup {
                            ForEach(queries.saved) { query in
                                let scope = WorkScope.query(id: query.id, name: query.name)
                                option(query.name, count: queries.count(query.id), selected: scope.stored == storedScope) { pick(scope) }
                            }
                        }
                    }
                    CellGroupHeader(title: "Lanes")
                    Picker("Lanes", selection: $grouping) {
                        ForEach(WorkGrouping.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .controlSize(.large)
                    .padding(.horizontal, 16)
                    .accessibilityIdentifier("work-grouping")
                    CellGroup {
                        Button { editingOrder = true } label: { Cell(title: "Lane order", value: "your walk", chevron: true) }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("work-lane-order")
                    }
                    .padding(.top, 10)
                }
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.immediately)
            .background(BD.sheet)
            .navigationTitle("Show")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Close")
                }
            }
            .tint(BD.text)
        }
        .presentationDetents([.fraction(0.86), .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(BD.sheet)
        .task(id: search) { await runSearch() }
        .task(id: queries.saved.count) {
            if queries.saved.isEmpty { await queries.loadSaved(app) }
            await queries.loadCounts(app)
        }
        .sheet(isPresented: $editingOrder) {
            LaneOrderSheet(stored: $laneOrder, states: LaneOrder.states(saved: LaneOrder.decode(laneOrder), overview: app.overview))
        }
    }

    private var searchField: some View {
        HStack(spacing: 7) {
            Image(systemName: "magnifyingglass").foregroundStyle(BD.text2)
            TextField("AB# or words from the title", text: $search)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onSubmit(openNumber)
                .accessibilityIdentifier("work-search")
            if !search.isEmpty {
                Button { search = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(BD.text3) }
                    .accessibilityLabel("Clear search")
            }
        }
        .font(.system(size: 17))
        .padding(.horizontal, 10)
        .frame(height: 40)
        .background(BD.fill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.top, 2)
    }

    @ViewBuilder
    private var searchResults: some View {
        if WorkSearch.query(search) != nil {
            CellGroupHeader(title: "Results", trailing: results.map { String($0.count) })
            if let searchError {
                StatusCard(icon: "exclamationmark.triangle", text: searchError, tone: .warn).padding(.top, -12)
            } else if let results {
                if results.isEmpty {
                    Text("Nothing matches.").font(.system(size: 15)).foregroundStyle(BD.text2).padding(.horizontal, 32)
                } else {
                    CellGroup(indent: 38) {
                        ForEach(results.prefix(20)) { item in
                            Button { open(item.id, prefill: item) } label: { SearchResultRow(item: item) }
                                .buttonStyle(.plain)
                        }
                    }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 12)
            }
        }
    }

    private func option(_ title: String, count: Int?, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Text(title).font(.system(size: 16, weight: .medium)).foregroundStyle(BD.text).lineLimit(1)
                Spacer(minLength: 8)
                if let count { Text(verbatim: "\(count)").font(.system(size: 15)).monospacedDigit().foregroundStyle(BD.text2) }
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(BD.accent)
                }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 46)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func pick(_ scope: WorkScope) {
        storedScope = scope.stored
        dismiss()
    }

    /// A number opens that item straight away, in or out of the scope.
    private func openNumber() {
        guard case .number(let id) = WorkSearch.query(search) else { return }
        open(id, prefill: nil)
    }

    private func open(_ id: Int, prefill: WorkItemSummary?) {
        dismiss()
        app.router.push(ItemRoute(id: id, prefill: prefill))
    }

    /// Words search ADO's titles after a short pause; a number shows the item it names.
    private func runSearch() async {
        guard let query = WorkSearch.query(search) else {
            results = nil
            return
        }
        try? await Task.sleep(for: .milliseconds(350))
        guard !Task.isCancelled else { return }
        do {
            switch query {
            case .number(let id):
                results = [try await app.api.item(id).item]
            case .words(let words):
                results = try await app.api.browse(query: nil, search: words).items
            }
            searchError = nil
        } catch is CancellationError {
        } catch {
            if (error as? APIError)?.isUnauthorized == true { app.report(error) }
            searchError = error.localizedDescription
        }
    }
}

/// What the Show sheet's search field holds: an item number ("61021", "AB#61021") or words from a title.
enum WorkSearch: Equatable {
    case number(Int)
    case words(String)

    static func query(_ text: String) -> WorkSearch? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let digits = trimmed.uppercased().replacingOccurrences(of: "AB#", with: "").replacingOccurrences(of: "#", with: "")
        if let id = Int(digits), id > 0 { return .number(id) }
        return trimmed.count >= 3 ? .words(trimmed) : nil
    }
}

/// A search hit: glyph, AB#, title and state.
private struct SearchResultRow: View {
    let item: WorkItemSummary

    var body: some View {
        HStack(spacing: 11) {
            WorkItemGlyph(typeName: item.typeName, size: 11)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).font(.system(size: 15, weight: .medium)).foregroundStyle(BD.text).lineLimit(1)
                Text(verbatim: "AB#\(item.id) · \(item.state)").font(.system(size: 12.5)).foregroundStyle(BD.text2).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 9)
        .contentShape(Rectangle())
    }
}
