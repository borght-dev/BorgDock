import SwiftUI

/// Search, iOS 26 style: the tab bar folds into the field at the bottom. Results are grouped by kind, with the
/// matched words marked; return opens the number you typed, or the first result.
struct SearchView: View {
    @Environment(AppModel.self) private var app

    private var store: SearchStore { app.search }

    var body: some View {
        @Bindable var store = app.search
        List {
            Section {
                scopes
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
            if store.query.trimmingCharacters(in: .whitespaces).isEmpty {
                Section {
                    Text("Pull requests, work items, threads and your notes. Type 3712 or AB#61021 to jump straight to it.")
                        .font(.system(size: 15))
                        .foregroundStyle(BD.text2)
                        .listRowBackground(Color.clear)
                }
            } else {
                results
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(6)
        .scrollContentBackground(.hidden)
        .background(BD.bg)
        .navigationTitle("Search")
        .searchable(text: $store.query, prompt: "PRs, items, notes, numbers")
        .onSubmit(of: .search) { Task { await store.submit() } }
        .task(id: store.query) { await store.run() }
        .onChange(of: app.notes.indexed) { Task { await store.run() } }
        .task {
            #if DEBUG
            let arguments = ProcessInfo.processInfo.arguments
            if let index = arguments.firstIndex(of: "-BorgDockSearch"), arguments.indices.contains(index + 1) { store.query = arguments[index + 1] }
            #endif
            await app.notes.indexAll()
        }
    }

    private var scopes: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(SearchStore.Scope.allCases, id: \.self) { scope in
                    Button { store.scope = scope } label: {
                        BucketPill(title: scope.title, count: store.count(scope), selected: store.scope == scope)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .scrollClipDisabled()
    }

    @ViewBuilder
    private var results: some View {
        let words = store.query.split(whereSeparator: \.isWhitespace).map(String.init)
        let showAll = store.scope == .all
        if let error = store.error, store.results == nil {
            Section {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.system(size: 14))
                    .foregroundStyle(BD.yellow)
                    .lineLimit(3)
            }
        }
        if let results = store.results {
            if (showAll || store.scope == .pullRequests), !results.pullRequests.isEmpty {
                Section {
                    ForEach(results.pullRequests) { pr in
                        row { app.router.push(.pullRequest(pr.prKey)) } label: { PullRequestHit(pr: pr, words: words) }
                    }
                } header: { header("Pull requests") }
            }
            if (showAll || store.scope == .items), !results.items.isEmpty {
                Section {
                    ForEach(results.items) { item in
                        row { app.router.push(.workItem(ItemRoute(id: item.id, prefill: item))) } label: { ItemHit(item: item, words: words) }
                    }
                } header: { header("Work items") }
            }
        }
        if (showAll || store.scope == .notes), !store.noteHits.isEmpty {
            Section {
                ForEach(store.noteHits) { hit in
                    row { app.router.push(.note(hit.file.path)) } label: {
                        NoteHitRow(hit: hit, backlinks: app.notes.backlinks(to: hit.file.title), words: words)
                    }
                }
            } header: { header("Notes") }
        }
        if let results = store.results, showAll || store.scope == .threads, !results.threads.isEmpty {
            Section {
                ForEach(results.threads) { thread in
                    row { app.openThread(thread.id) } label: { ThreadHit(thread: thread, words: words) }
                }
            } header: { header("Threads") }
        }
        if !store.isSearching, store.results.map({ $0.pullRequests.isEmpty && $0.items.isEmpty && $0.threads.isEmpty }) ?? false, store.noteHits.isEmpty {
            Section {
                Text("Nothing matches “\(store.query)”.").foregroundStyle(BD.text2).listRowBackground(Color.clear)
            }
        }
    }

    private func row(_ action: @escaping () -> Void, @ViewBuilder label: () -> some View) -> some View {
        Button(action: action, label: label)
            .buttonStyle(.plain)
            .listRowBackground(BD.card)
            .alignmentGuide(.listRowSeparatorLeading) { _ in 60 }
    }

    private func header(_ title: String) -> some View {
        Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(BD.text2).textCase(nil)
    }
}

/// `text` with every word of the query marked.
enum SearchHighlight {
    static func text(_ text: String, words: [String]) -> AttributedString {
        var attributed = AttributedString(text)
        for word in words where !word.isEmpty {
            var searchStart = attributed.startIndex
            while searchStart < attributed.endIndex,
                  let range = attributed[searchStart...].range(of: word, options: .caseInsensitive) {
                attributed[range].backgroundColor = BD.yellowSoft
                attributed[range].foregroundColor = BD.yellow
                searchStart = range.upperBound
            }
        }
        return attributed
    }
}

private struct HitRow<Icon: View>: View {
    let title: AttributedString
    let detail: AttributedString
    @ViewBuilder let icon: Icon

    var body: some View {
        HStack(spacing: 16) {
            icon.frame(width: 28)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 17.5)).foregroundStyle(BD.text).lineLimit(1)
                Text(detail).font(.system(size: 14.5)).foregroundStyle(BD.text2).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }
}

private struct PullRequestHit: View {
    let pr: SearchPullRequest
    let words: [String]

    var body: some View {
        HitRow(title: SearchHighlight.text(pr.title, words: words), detail: SearchHighlight.text(detail, words: words)) {
            Image(systemName: merged ? "arrow.triangle.merge" : "arrow.triangle.pull")
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(merged ? BD.merged : pr.state == "closed" ? BD.red : BD.green)
        }
    }

    private var merged: Bool { pr.state == "merged" }

    /// "shop #3712 · 2 failing", "shop #3655 · merged 12 Oct".
    private var detail: String {
        var parts = ["\(pr.repo) #\(pr.number)"]
        if merged {
            parts.append("merged" + (pr.mergedAt.flatMap(ISODates.parse).map { " " + $0.formatted(.dateTime.day().month(.abbreviated)) } ?? ""))
        } else if pr.state == "closed" {
            parts.append("closed")
        } else if let checks = pr.checks, checks.failed > 0 {
            parts.append("\(checks.failed) failing")
        } else if let checks = pr.checks, checks.pending > 0 {
            parts.append("checks running")
        } else if pr.isDraft {
            parts.append("draft")
        }
        return parts.joined(separator: " · ")
    }
}

private struct ItemHit: View {
    let item: WorkItemSummary
    let words: [String]

    var body: some View {
        HitRow(title: SearchHighlight.text(item.title, words: words), detail: SearchHighlight.text("AB#\(item.id) · \(item.state)", words: words)) {
            WorkItemGlyph(typeName: item.typeName, size: 18)
        }
    }
}

private struct NoteHitRow: View {
    let hit: NotesStore.NoteHit
    let backlinks: Int
    let words: [String]

    var body: some View {
        HitRow(title: SearchHighlight.text(hit.file.title, words: words), detail: SearchHighlight.text(detail, words: words)) {
            Image(systemName: "doc.text").font(.system(size: 19)).foregroundStyle(BD.yellow)
        }
    }

    /// The matching line, or "Updated Tuesday · 4 backlinks" when the title matched.
    private var detail: String {
        if let snippet = hit.snippet { return snippet }
        var parts = ["Updated \(hit.file.modified.formatted(.relative(presentation: .named)))"]
        if backlinks > 0 { parts.append(backlinks == 1 ? "1 backlink" : "\(backlinks) backlinks") }
        return parts.joined(separator: " · ")
    }
}

private struct ThreadHit: View {
    let thread: ThreadSummary
    let words: [String]

    var body: some View {
        HitRow(title: SearchHighlight.text(thread.title, words: words), detail: SearchHighlight.text(thread.worktree, words: words)) {
            Image(systemName: "bubble.left.and.text.bubble.right").font(.system(size: 17)).foregroundStyle(BD.accent)
        }
    }
}
