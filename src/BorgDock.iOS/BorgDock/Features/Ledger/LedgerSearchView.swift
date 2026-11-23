import SwiftUI

/// The magnifier of the title bar: every open pull request of your repositories and what merged this week, by title,
/// number, author, branch or AB#. Results keep the overview's sections and rows; the chips are the filters of the old
/// list's tabs.
struct LedgerSearchView: View {
    @Environment(AppModel.self) private var app
    let focus: Focus
    let workItems: LedgerWorkItems
    var startText = ""
    let close: () -> Void

    @State private var search = LedgerSearch()
    @State private var merged: [PrSummary] = []
    @FocusState private var typing: Bool

    private static let sections: [LedgerSection] = [.toReview, .needsYou, .ready, .waiting, .alsoOpen, .merged]

    var body: some View {
        let store = app.focus
        let now = Date.now
        let context = LedgerContext(focus: focus, app: app, now: now)
        let ledger = Ledger(focus.pullRequests + merged, context, includeSnoozed: true)
        let stale = store.trouble != nil
        List {
            if search.isEmpty {
                hint
            } else {
                let found = Self.sections.map { section in (section, ledger.rows(in: section).filter { search.matches($0, now: now, staleAfterDays: focus.staleAfterDays ?? 7) }) }
                if found.allSatisfy(\.1.isEmpty) {
                    nothingFound
                } else {
                    ForEach(found, id: \.0) { section, rows in
                        if !rows.isEmpty {
                            Section {
                                LedgerRows(rows: rows, now: now, stale: stale, workItems: workItems)
                            } header: {
                                LedgerSectionHeader(title: section == .alsoOpen ? "Also open" : section.title, count: rows.count)
                                    .accessibilityIdentifier("ledger-found-\(section.rawValue)")
                            }
                        }
                    }
                }
            }
        }
        .ledgerList()
        .scrollDismissesKeyboard(.immediately)
        .safeAreaInset(edge: .top, spacing: 0) { bar }
        .task {
            search.text = startText
            typing = true
            if let read = try? await app.pullRequests.mergedThisWeek() { merged = read }
        }
        .accessibilityIdentifier("ledger-search-results")
    }

    private var bar: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                HStack(spacing: 7) {
                    Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .medium)).foregroundStyle(BD.text3)
                    TextField("Title, number, author, branch, AB#", text: $search.text)
                        .font(.system(size: 16))
                        .foregroundStyle(BD.text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.search)
                        .focused($typing)
                        .accessibilityIdentifier("ledger-search-field")
                    if !search.text.isEmpty {
                        Button { search.text = "" } label: {
                            Image(systemName: "xmark.circle.fill").font(.system(size: 15)).foregroundStyle(BD.text3)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Clear")
                    }
                }
                .padding(.horizontal, 11)
                .frame(height: 38)
                .background(BD.fill2, in: Capsule())
                Button("Cancel", action: close)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(BD.accentText)
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("ledger-search-cancel")
            }
            .padding(.horizontal, 16)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 7) {
                    ForEach(LedgerFilter.allCases) { filter in
                        let on = search.filters.contains(filter)
                        Button {
                            withAnimation(.snappy) { if on { search.filters.remove(filter) } else { search.filters.insert(filter) } }
                        } label: {
                            Text(filter.title)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(on ? BD.bg : BD.text2)
                                .padding(.horizontal, 12)
                                .frame(height: 30)
                                .background(on ? BD.text : BD.fill, in: Capsule())
                                .frame(minHeight: 40)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(on ? .isSelected : [])
                        .accessibilityIdentifier("ledger-filter-\(filter.rawValue)")
                    }
                }
                .padding(.horizontal, 16)
            }
        }
        .padding(.top, 8)
        .padding(.bottom, 2)
        .background(LedgerList.barBackground)
    }

    private var hint: some View {
        Text("Every open pull request in your repositories, and the ones merged this week.")
            .font(.system(size: 14))
            .foregroundStyle(BD.text3)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, 60)
            .padding(.horizontal, 40)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
    }

    private var nothingFound: some View {
        VStack(spacing: 6) {
            Image(systemName: "magnifyingglass").font(.system(size: 26)).foregroundStyle(BD.text3).padding(.bottom, 4)
            Text("No pull request matches").font(.system(size: 16, weight: .semibold)).foregroundStyle(BD.text)
            Text("Open and merged-this-week pull requests of the repositories you watch are searched.")
                .font(.system(size: 13.5))
                .foregroundStyle(BD.text2)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 70)
        .padding(.horizontal, 40)
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .accessibilityIdentifier("ledger-nothing-found")
    }
}
