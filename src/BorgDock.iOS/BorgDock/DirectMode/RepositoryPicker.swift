import SwiftUI

/// Which repositories to watch, grouped by account: every open pull request of a watched one is listed, yours or not.
/// The ones you work in start switched on. "Also read" keeps a review request from a repository you don't watch in
/// To review. The first run's step 3 and Settings → Repositories.
struct RepositoryPicker: View {
    @Environment(AppModel.self) private var app
    let session: DirectSession
    var step: String?
    /// The first run's "Show my pull requests".
    var finish: (() -> Void)?

    @State private var available: [String: [AvailableRepository]]?
    @State private var involvement: [String: Int] = [:]
    @State private var read: PrRepositories?
    @State private var watched: [String] = []
    @State private var search = ""
    @State private var showsAll: Set<String> = []
    @State private var changed = false

    /// Unwatched repositories shown per account before "more".
    private static let shownUnwatched = 4
    /// How many repositories the first run switches on by itself.
    private static let startOn = 12

    var body: some View {
        let accounts = session.credentials.gitHub
        List {
            ForEach(accounts) { account in
                let all = repositories(of: account)
                let visible = shown(all, account: account)
                Section {
                    if available == nil {
                        HStack(spacing: 10) {
                            ProgressView()
                            Text("Reading \(account.login)'s repositories…").foregroundStyle(BD.text2)
                        }
                        .font(.system(size: 14.5))
                    }
                    ForEach(visible) { repository in row(repository) }
                    if visible.count < all.count, search.isEmpty {
                        Button { withAnimation(.snappy) { _ = showsAll.insert(account.id) } } label: {
                            HStack {
                                Text("\(all.count - visible.count) more").font(.system(size: 15, weight: .semibold)).foregroundStyle(BD.accentText)
                                Spacer()
                                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(BD.text3)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("repositories-more-\(account.login)")
                    }
                } header: {
                    HStack {
                        Text(verbatim: account.label.flatMap { $0.isEmpty ? nil : "\(account.login) · \($0)" } ?? account.login)
                        Spacer()
                        if !all.isEmpty { Text(verbatim: "\(all.filter { isWatched($0.name) }.count) of \(all.count) on").monospacedDigit() }
                    }
                    .textCase(nil)
                    .accessibilityIdentifier("repositories-account-\(account.login)")
                }
            }

            let extra = elsewhere
            if !extra.isEmpty || manual != nil {
                Section {
                    ForEach(extra, id: \.self) { name in
                        row(AvailableRepository(name: name, pushedAt: nil, isPrivate: false, isArchived: false))
                    }
                    if let manual {
                        Button { toggle(manual, on: true); search = "" } label: {
                            Label("Watch \(manual)", systemImage: "plus").foregroundStyle(BD.accentText)
                        }
                        .accessibilityIdentifier("repositories-add")
                    }
                } header: {
                    Text("Other repositories").textCase(nil)
                } footer: {
                    Text("One that isn't in your accounts' lists: type it as owner/repository in the search field.")
                }
            }

            if let read {
                Section {
                    Toggle("Pull requests that involve you elsewhere", isOn: preference(\.includeInvolving, current: read.includeInvolving))
                        .accessibilityIdentifier("repositories-involving")
                    Toggle("Review requests for your teams", isOn: preference(\.includeTeamRequests, current: read.includeTeamRequests))
                        .disabled(!read.includeInvolving)
                        .accessibilityIdentifier("repositories-teams")
                } header: {
                    Text("Also read").textCase(nil)
                } footer: {
                    Text("A review request from a repository you don't watch still lands in To review.")
                }
                if read.cutOff {
                    Section { Label("GitHub returned more pull requests than fit in one read; the list is cut off.", systemImage: "scissors").foregroundStyle(BD.text2) }
                }
            }
        }
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: Text(searchPrompt))
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { SetupTitle(title: "Repositories", step: step) }
        .tint(BD.accent)
        .safeAreaInset(edge: .bottom) {
            if let finish {
                Button {
                    Task {
                        await apply()
                        finish()
                    }
                } label: { Text("Show my pull requests") }
                    .buttonStyle(.bdPrimary)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
                    .accessibilityIdentifier("repositories-finish")
            }
        }
        .task { await load() }
        .onDisappear { if finish == nil { Task { await apply() } } }
        .accessibilityIdentifier("repositories")
    }

    // MARK: Rows

    private func row(_ repository: AvailableRepository) -> some View {
        Toggle(isOn: Binding(get: { isWatched(repository.name) }, set: { toggle(repository.name, on: $0) })) {
            VStack(alignment: .leading, spacing: 2) {
                Text(repository.name).font(.system(size: 16, weight: .medium)).foregroundStyle(BD.text).lineLimit(1).truncationMode(.middle)
                let (text, bad) = subtitle(repository)
                if !text.isEmpty { Text(text).font(.system(size: 13)).foregroundStyle(bad ? BD.red : BD.text2).lineLimit(1) }
            }
        }
        .tint(BD.green)
        .accessibilityIdentifier("repository-\(repository.name)")
    }

    /// What a read found for a watched one; how much of it involves you; else when it was last pushed to.
    private func subtitle(_ repository: AvailableRepository) -> (String, Bool) {
        if let known = read?.repositories.first(where: { $0.name.caseInsensitiveCompare(repository.name) == .orderedSame }), isWatched(repository.name), known.polledAt != nil || !known.ok {
            if !known.ok { return (known.error ?? "Couldn't be read", true) }
            let mine = involvement[repository.id] ?? 0
            let open = known.open == 0 ? "None open" : "\(known.open) open"
            return (mine > 0 ? "\(open) · \(mine) involve\(mine == 1 ? "s" : "") you" : open, false)
        }
        if let mine = involvement[repository.id], mine > 0 { return ("\(mine) open involve\(mine == 1 ? "s" : "") you", false) }
        let pushed = ShortTime.age(repository.pushedAt)
        return (pushed.isEmpty ? "" : pushed == "now" ? "Pushed to just now" : "Pushed to \(pushed) ago", false)
    }

    private var searchPrompt: String {
        let count = Set((available ?? [:]).values.joined().map(\.id)).count
        return count > 0 ? "Search \(count) repositories" : "Search, or owner/repository"
    }

    // MARK: What shows

    private func repositories(of account: DirectCredentials.GitHub) -> [AvailableRepository] {
        let list = available?[account.login] ?? []
        // A repository two accounts read shows under the first.
        let earlier = Set(session.credentials.gitHub.prefix { $0.id != account.id }.flatMap { available?[$0.login] ?? [] }.map(\.id))
        return list.filter { !earlier.contains($0.id) }
    }

    /// Watched first, then the ones that involve you, then the newest; everything while searching or after "more".
    private func shown(_ all: [AvailableRepository], account: DirectCredentials.GitHub) -> [AvailableRepository] {
        let words = search.lowercased().split(whereSeparator: \.isWhitespace)
        if !words.isEmpty { return all.filter { repository in words.allSatisfy { repository.name.lowercased().contains($0) } } }
        let ranked = all.enumerated().sorted { a, b in
            let (rankA, rankB) = (rank(a.element), rank(b.element))
            return rankA == rankB ? a.offset < b.offset : rankA < rankB
        }.map(\.element)
        if showsAll.contains(account.id) { return ranked }
        let leading = ranked.filter { rank($0) < 2 }
        return leading + ranked.dropFirst(leading.count).prefix(Self.shownUnwatched)
    }

    private func rank(_ repository: AvailableRepository) -> Int {
        if isWatched(repository.name) { return 0 }
        return (involvement[repository.id] ?? 0) > 0 ? 1 : 2
    }

    /// Watched repositories no account lists: typed by hand, or left over from an account that was removed.
    private var elsewhere: [String] {
        let listed = Set((available ?? [:]).values.joined().map(\.id))
        guard available != nil else { return [] }
        return watched.filter { !listed.contains($0.lowercased()) }
    }

    /// `owner/repository` in the search field that no list has: it can be watched all the same.
    private var manual: String? {
        guard let name = GitHubSettings.cleanRepositories([search]).first, !isWatched(name) else { return nil }
        let listed = Set((available ?? [:]).values.joined().map(\.id))
        return listed.contains(name.lowercased()) ? nil : name
    }

    private func isWatched(_ name: String) -> Bool {
        watched.contains { $0.caseInsensitiveCompare(name) == .orderedSame }
    }

    // MARK: Changing

    private func toggle(_ name: String, on: Bool) {
        if on {
            if !isWatched(name) { watched.append(name) }
        } else {
            watched.removeAll { $0.caseInsensitiveCompare(name) == .orderedSame }
        }
        changed = true
        let names = watched
        Task { read = await session.gitHub.watch(names) }
    }

    private func preference(_ path: WritableKeyPath<PrRepositoryPreferences, Bool?>, current: Bool) -> Binding<Bool> {
        Binding(get: { current }, set: { value in
            var preferences = PrRepositoryPreferences()
            preferences[keyPath: path] = value
            changed = true
            Task { read = await session.gitHub.setRepositoryPreferences(preferences) }
        })
    }

    private func load() async {
        let known = await session.gitHub.repositories()
        read = known
        watched = known.repositories.map(\.name)
        involvement = await session.gitHub.involvement()
        let found = await session.gitHub.availableRepositories()
        available = found
        // The first run, with nothing chosen yet: the repositories you work in start switched on.
        if finish != nil, watched.isEmpty {
            if involvement.isEmpty {
                await app.focus.load()
                involvement = await session.gitHub.involvement()
            }
            let listed = found.values.joined().filter { (involvement[$0.id] ?? 0) > 0 }
            let start = listed.sorted { (involvement[$0.id] ?? 0) > (involvement[$1.id] ?? 0) }.prefix(Self.startOn).map(\.name)
            if !start.isEmpty {
                watched = start
                changed = true
                read = await session.gitHub.watch(start)
            }
        }
    }

    /// Reads the list with the new choice once, when you leave.
    private func apply() async {
        guard changed else { return }
        changed = false
        await app.focus.load(reportErrors: true, fresh: true)
    }
}
