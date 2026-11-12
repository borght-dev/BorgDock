import SwiftUI

/// Settings → Pull requests → Repositories: where the list of repositories comes from, what each read found, what else
/// is read, and whether GitHub cut anything off. Mockup: design/ios-flow/mockups.html, section 03, "Repositories".
struct RepositoriesView: View {
    @Environment(AppModel.self) private var app
    @State private var repositories: PrRepositories?
    @State private var error: String?
    @State private var showsAll = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let repositories {
                    content(repositories)
                } else if let error {
                    ContentUnavailableView {
                        Label("Can't read the repositories", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Try again") { Task { await load() } }.buttonStyle(.bordered)
                    }
                    .padding(.top, 60)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
                }
            }
            .padding(.bottom, 32)
        }
        .background(BD.bg)
        .navigationTitle("Repositories")
        .navigationBarTitleDisplayMode(.inline)
        .tint(BD.text)
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder
    private func content(_ repositories: PrRepositories) -> some View {
        let source = RepositoriesCopy.source(repositories)
        SourceBanner(source: source)
        let rows = RepositoriesCopy.ordered(repositories.repositories)
        if !rows.isEmpty {
            GroupHeader(title: RepositoriesCopy.count(rows.count), trailing: "\(rows.reduce(0) { $0 + $1.open }) open")
                .padding(.horizontal, 16)
            CellGroup(indent: 58) {
                ForEach(showsAll ? rows : Array(rows.prefix(RepositoriesCopy.shownFolded))) { repository in
                    CompactCell(
                        title: repository.name,
                        subtitle: RepositoriesCopy.line(repository),
                        subtitleColor: repository.ok ? BD.text2 : BD.red,
                        subtitleLines: repository.ok ? 1 : 2
                    ) {
                        CellIcon(systemImage: "folder", color: BD.text2, soft: true)
                    } trailing: {
                        EmptyView()
                    }
                    .accessibilityIdentifier("repository-\(repository.name)")
                }
                if rows.count > RepositoriesCopy.shownFolded {
                    Button { withAnimation(.snappy) { showsAll.toggle() } } label: {
                        Text(showsAll ? "Show fewer" : "\(rows.count - RepositoriesCopy.shownFolded) more")
                            .font(.system(size: 15.5, weight: .medium))
                            .foregroundStyle(BD.accentText)
                            .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
                            .padding(.leading, 58)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("repositories-more")
                }
            }
        }
        GroupHeader(title: "Also read").padding(.horizontal, 16)
        CellGroup {
            CompactCell(title: "PRs that involve you anywhere", subtitle: "Author, mention, review request") {
                Toggle("PRs that involve you anywhere", isOn: preference(\.includeInvolving) { PrRepositoryPreferences(includeInvolving: $0) })
                    .labelsHidden()
                    .tint(BD.green)
            }
            CompactCell(title: "Your teams' review requests") {
                Toggle("Your teams' review requests", isOn: preference(\.includeTeamRequests) { PrRepositoryPreferences(includeTeamRequests: $0) })
                    .labelsHidden()
                    .tint(BD.green)
            }
        }
        Text("\(Text(RepositoriesCopy.headline(repositories)).fontWeight(.semibold).foregroundStyle(BD.text2)) \(RepositoriesCopy.detail(repositories))")
            .font(.system(size: 12.5))
            .foregroundStyle(BD.text3)
            .lineSpacing(2)
            .padding(.horizontal, 24)
            .padding(.top, 14)
    }

    /// A toggle that writes the preference at once and puts it back when the server refuses.
    private func preference(_ value: KeyPath<PrRepositories, Bool>, _ change: @escaping (Bool) -> PrRepositoryPreferences) -> Binding<Bool> {
        Binding {
            repositories?[keyPath: value] ?? false
        } set: { newValue in
            Task { await save(change(newValue)) }
        }
    }

    private func load() async {
        do {
            repositories = try await app.api.repositories()
            error = nil
        } catch is CancellationError {
            return
        } catch {
            if repositories == nil {
                self.error = (error as? APIError)?.message ?? error.localizedDescription
            } else {
                app.report(error)
            }
        }
    }

    private func save(_ preferences: PrRepositoryPreferences) async {
        guard let current = repositories else { return }
        repositories = current.with(preferences)
        do {
            repositories = try await app.api.setRepositoryPreferences(preferences)
            await app.focus.load()
        } catch {
            repositories = current
            app.report(error)
        }
    }
}

/// The banner on top: who decides the repositories, and where to change them.
private struct SourceBanner: View {
    let source: RepositoriesCopy.Source

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: source.systemImage)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(source.warns ? BD.yellow : BD.accentText)
                .padding(.top, 1)
            Text("\(Text(source.title).fontWeight(.semibold).foregroundStyle(BD.text)) \(Text(source.detail).foregroundStyle(BD.text2))")
                .font(.system(size: 14))
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(source.warns ? BD.yellowSoft : BD.accentSoft, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .accessibilityElement(children: .combine)
    }
}

/// The Repositories screen's words. Pure, so each variant has a test.
enum RepositoriesCopy {
    struct Source: Equatable {
        let title: String
        let detail: String
        let systemImage: String
        /// Nothing is read beyond what involves you: the banner says so in yellow.
        var warns = false
    }

    /// Rows shown before "12 more".
    static let shownFolded = 4

    static func source(_ repositories: PrRepositories) -> Source {
        switch repositories.source {
        case .desktop:
            let desktop = repositories.desktopName.map { "BorgDock on \($0)" } ?? "BorgDock on your desktop"
            return Source(title: "From your desktop.", detail: "\(desktop) shares the repositories it watches. Add or remove them there.", systemImage: "desktopcomputer")
        case .config:
            return Source(title: "From the server's settings.", detail: "The server reads the repositories in its config.json. Link BorgDock on your desktop to read the ones it watches instead.", systemImage: "server.rack")
        case .none:
            return Source(title: "No repositories yet.", detail: "Only pull requests that involve you show up. Link BorgDock on your desktop to read every repository it watches.", systemImage: "exclamationmark.triangle", warns: true)
        }
    }

    /// Failed reads first, then the most open pull requests, then by name.
    static func ordered(_ repositories: [PrRepositories.Repository]) -> [PrRepositories.Repository] {
        repositories.sorted { a, b in
            if a.ok != b.ok { return !a.ok }
            if a.open != b.open { return a.open > b.open }
            return a.name.localizedStandardCompare(b.name) == .orderedAscending
        }
    }

    static func count(_ repositories: Int) -> String {
        repositories == 1 ? "1 repository" : "\(repositories) repositories"
    }

    /// "41 open · read 20 s ago", or why the read failed.
    static func line(_ repository: PrRepositories.Repository, now: Date = .now) -> String {
        guard repository.ok else { return repository.error ?? "Couldn't read it" }
        let read = ISODate.parse(repository.polledAt).map { "read \(ago($0, now: now))" } ?? "not read yet"
        return "\(repository.open) open · \(read)"
    }

    /// The footer's first sentence: "Read 30 s ago, nothing cut off."
    static func headline(_ repositories: PrRepositories, now: Date = .now) -> String {
        let read = ISODate.parse(repositories.polledAt).map { "Read \(ago($0, now: now))" } ?? "Not read yet"
        return repositories.cutOff ? "\(read), some results cut off." : "\(read), nothing cut off."
    }

    /// How the server reads, so missing pull requests are explained instead of silent.
    static func detail(_ repositories: PrRepositories) -> String {
        repositories.cutOff
            ? "A search reached GitHub's limit of 1,000 results, so pull requests past it are missing. Each repository is its own search, paged to the end."
            : "GitHub's search returns at most 100 results per query, so each repository is its own search, paged to the end."
    }

    /// "20 s ago", "3 min ago", "2 h ago".
    static func ago(_ date: Date, now: Date) -> String {
        let seconds = Int(max(0, now.timeIntervalSince(date)))
        if seconds < 60 { return "\(seconds) s ago" }
        if seconds < 3600 { return "\(seconds / 60) min ago" }
        if seconds < 86400 { return "\(seconds / 3600) h ago" }
        return "\(seconds / 86400) d ago"
    }
}

private extension PrRepositories {
    /// The same read with the preferences applied, shown while the server saves them.
    func with(_ preferences: PrRepositoryPreferences) -> PrRepositories {
        PrRepositories(
            source: source, desktopName: desktopName, updatedAt: updatedAt, repositories: repositories,
            includeInvolving: preferences.includeInvolving ?? includeInvolving,
            includeTeamRequests: preferences.includeTeamRequests ?? includeTeamRequests,
            polledAt: polledAt, cutOff: cutOff
        )
    }
}
