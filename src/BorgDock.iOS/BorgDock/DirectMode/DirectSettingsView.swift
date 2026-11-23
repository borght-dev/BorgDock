import SwiftUI

/// BorgDock Review's settings, from your avatar (design/review-app/mockups.html): the accounts first, each with its
/// label, its repositories and when its token runs out; then what is read, how a review goes, and Face ID.
struct DirectSettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let session: DirectSession

    @State private var addingAccount = false
    @State private var watched: PrRepositories?
    @State private var available: Int?
    @State private var refresh = Int(GitHubDirect.pollEvery)
    @AppStorage(ReviewPreferences.readAllKey) private var readAll = true
    @AppStorage(ReviewPreferences.stepsKey) private var steps = ReviewPreferences.Steps.both.rawValue

    var body: some View {
        @Bindable var session = session
        List {
            Section {
                ForEach(session.credentials.gitHub) { account in
                    NavigationLink { GitHubAccountView(session: session, login: account.login) } label: { accountRow(account) }
                        .accessibilityIdentifier("account-\(account.login)")
                }
                Button { addingAccount = true } label: { Label("Add an account", systemImage: "plus") }
                    .accessibilityIdentifier("add-account")
            } header: {
                Text("GitHub")
            }

            Section {
                NavigationLink { AzureDevOpsScreen(session: session) { } } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "checklist")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(BD.text2)
                            .frame(width: 34, height: 34)
                            .background(BD.fill2, in: Circle())
                        if let connection = session.credentials.azureDevOps {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(connection.organizationURL.lastPathComponent).font(.system(size: 16, weight: .semibold)).foregroundStyle(BD.text)
                                Text("Project \(connection.project)").font(.system(size: 13.5)).foregroundStyle(BD.text2)
                            }
                            Spacer(minLength: 6)
                            Text("Connected").font(.system(size: 14)).foregroundStyle(BD.green)
                        } else {
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Connect Azure DevOps").font(.system(size: 16, weight: .semibold)).foregroundStyle(BD.accentText)
                                Text("The work item behind an AB# reference").font(.system(size: 13.5)).foregroundStyle(BD.text2)
                            }
                        }
                    }
                }
                .accessibilityIdentifier("connect-ado")
            } header: {
                Text("Azure DevOps")
            }

            Section("Pull requests") {
                NavigationLink(value: Route.repositories) {
                    LabeledContent("Repositories", value: repositoriesValue)
                }
                .accessibilityIdentifier("settings-repositories")
                Picker("Refresh", selection: $refresh) {
                    ForEach(GitHubSettings.refreshChoices, id: \.self) { seconds in
                        Text(seconds == 60 ? "Every minute while open" : "Every \(seconds / 60) min while open").tag(seconds)
                    }
                }
                .accessibilityIdentifier("settings-refresh")
            }

            Section {
                Toggle("Read every file before approving", isOn: $readAll)
                    .accessibilityIdentifier("settings-read-all")
                Picker("Tests and generated files", selection: $steps) {
                    ForEach(ReviewPreferences.Steps.allCases) { Text($0.title).tag($0.rawValue) }
                }
                .accessibilityIdentifier("settings-steps")
                Toggle("Face ID for approvals and merges", isOn: $session.faceIdForActions)
                    .accessibilityIdentifier("settings-face-id")
            } header: {
                Text("Review")
            } footer: {
                Text("Tokens are stored in this iPhone's keychain and go only to github.com and dev.azure.com.")
            }

            Section {
                LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() }.accessibilityIdentifier("settings-done") }
        }
        .tint(BD.accent)
        .onChange(of: session.faceIdForActions) { Task { await app.focus.loadPreferences() } }
        .onChange(of: refresh) { _, seconds in Task { await session.gitHub.setRefresh(seconds: seconds) } }
        .task(id: session.credentials.gitHub.map(\.id)) {
            watched = await session.gitHub.repositories()
            refresh = Int(await session.gitHub.refreshEvery)
            available = Set(await session.gitHub.availableRepositories().values.joined().map(\.id)).count
        }
        .sheet(isPresented: $addingAccount) {
            NavigationStack {
                GitHubTokenScreen(session: session) { _ in
                    addingAccount = false
                    Task { await app.focus.load(reportErrors: true, fresh: true) }
                }
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { addingAccount = false } } }
            }
            .tint(BD.accent)
        }
    }

    /// "12 of 43".
    private var repositoriesValue: String {
        guard let watched else { return "" }
        let count = watched.repositories.count
        guard let available, available >= count, available > 0 else { return count == 0 ? "None" : "\(count)" }
        return "\(count) of \(available)"
    }

    private func accountRow(_ account: DirectCredentials.GitHub) -> some View {
        let warning = account.expiryWarning()
        let repositories = (watched?.repositories ?? []).filter { $0.name.lowercased().hasPrefix(account.login.lowercased() + "/") }.count
        return HStack(spacing: 12) {
            PersonAvatar(name: account.name ?? account.login, size: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text(account.login).font(.system(size: 16, weight: .semibold)).foregroundStyle(BD.text).lineLimit(1)
                HStack(spacing: 0) {
                    Text(account.label.flatMap { $0.isEmpty ? nil : $0 } ?? (account.name ?? "GitHub")).foregroundStyle(BD.text2)
                    if let warning {
                        Text(verbatim: " · \(warning.prefix(1).lowercased() + warning.dropFirst())").foregroundStyle((account.daysLeft() ?? 0) < 3 ? BD.red : BD.yellow)
                    } else if repositories > 0 {
                        Text(verbatim: " · \(repositories == 1 ? "1 repository" : "\(repositories) repositories")").foregroundStyle(BD.text2)
                    }
                }
                .font(.system(size: 13.5))
                .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// One GitHub account in Settings: what its token may do and when it runs out, its label, a new token, or out.
struct GitHubAccountView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let session: DirectSession
    let login: String

    @State private var facts: GitHubTokenFacts?
    @State private var failure: String?
    @State private var label = AccountLabel.work
    @State private var customLabel = ""
    @State private var replacing = false
    @State private var confirmsRemoval = false

    private var account: DirectCredentials.GitHub? {
        session.credentials.gitHub.first { $0.login.caseInsensitiveCompare(login) == .orderedSame }
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    PersonAvatar(name: account?.name ?? login, size: 40)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(account?.name ?? login).font(.system(size: 17, weight: .semibold)).foregroundStyle(BD.text)
                        Text(verbatim: "@\(login)").font(.system(size: 14)).foregroundStyle(BD.text2)
                    }
                }
            }
            Section {
                if let facts {
                    LabeledContent("Reads", value: facts.reach.replacingOccurrences(of: "Reads ", with: ""))
                    ForEach(facts.rows()) { row in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.title).font(.system(size: 15.5)).foregroundStyle(row.mark == .missing ? BD.red : BD.text)
                            if !row.detail.isEmpty { Text(row.detail).font(.system(size: 13)).foregroundStyle(BD.text2) }
                        }
                    }
                } else if let failure {
                    Label(failure, systemImage: "exclamationmark.triangle.fill").foregroundStyle(BD.red)
                } else {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Asking GitHub what this token may do…").foregroundStyle(BD.text2)
                    }
                }
                Button("Replace the token") { replacing = true }.accessibilityIdentifier("account-replace")
            } header: {
                Text("Token")
            }
            Section {
                Picker("Show it as", selection: $label) {
                    ForEach(AccountLabel.allCases) { Text($0.title).tag($0) }
                }
                if label == .other {
                    TextField("A word for this account", text: $customLabel).onSubmit(saveLabel)
                }
            } footer: {
                Text("Only for you: it names the account here and when its token runs out.")
            }
            Section {
                Button("Remove \(login)", role: .destructive) { confirmsRemoval = true }.accessibilityIdentifier("account-remove")
            } footer: {
                Text("Its token leaves this iPhone's keychain. Nothing changes on GitHub.")
            }
        }
        .navigationTitle(account?.shownLabel ?? login)
        .navigationBarTitleDisplayMode(.inline)
        .tint(BD.accent)
        .task { await check() }
        .onAppear { (label, customLabel) = AccountLabel.parse(account?.label) }
        .onChange(of: label) { saveLabel() }
        .onDisappear(perform: saveLabel)
        .confirmationDialog("Remove \(login)?", isPresented: $confirmsRemoval, titleVisibility: .visible) {
            Button("Remove the account", role: .destructive, action: remove)
        } message: {
            Text("Its pull requests leave the overview.")
        }
        .sheet(isPresented: $replacing) {
            NavigationStack {
                GitHubTokenScreen(session: session, replacing: login) { _ in
                    replacing = false
                    Task {
                        await check()
                        await app.focus.load(reportErrors: true, fresh: true)
                    }
                }
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { replacing = false } } }
            }
            .tint(BD.accent)
        }
    }

    private func check() async {
        guard let token = account?.token else { return }
        do {
            facts = try await session.checkGitHubToken(token)
            failure = nil
        } catch is CancellationError {
        } catch {
            facts = nil
            failure = error.localizedDescription
        }
    }

    private func saveLabel() {
        let word = label == .other ? customLabel : label.title
        guard account != nil, word != account?.label, !(label == .other && word.trimmingCharacters(in: .whitespaces).isEmpty) else { return }
        session.setLabel(word, for: login)
    }

    private func remove() {
        session.removeGitHubAccount(login)
        if session.hasGitHub {
            Task { await app.focus.load(reportErrors: true, fresh: true) }
            dismiss()
        } else {
            app.focus.forget()
            app.router.reset()
        }
    }
}

/// How a review goes on this phone.
enum ReviewPreferences {
    /// Approve stays locked until every file and step is marked reviewed. On unless you turn it off.
    static let readAllKey = "review.readAllBeforeApproving"
    static let stepsKey = "review.steps"

    /// Which kinds of files the walk reads as one step instead of one by one.
    enum Steps: String, CaseIterable, Identifiable {
        case both, tests, generated, none

        var id: String { rawValue }

        var title: String {
            switch self {
            case .both: "One step each"
            case .tests: "Tests as one step"
            case .generated: "Generated as one step"
            case .none: "File by file"
            }
        }

        var groups: Set<ReviewWalk.Group> {
            switch self {
            case .both: [.tests, .generated]
            case .tests: [.tests]
            case .generated: [.generated]
            case .none: []
            }
        }
    }

    static func readAll(_ defaults: UserDefaults = .standard) -> Bool {
        defaults.object(forKey: readAllKey) as? Bool ?? true
    }

    static func steps(_ defaults: UserDefaults = .standard) -> Steps {
        defaults.string(forKey: stepsKey).flatMap(Steps.init(rawValue:)) ?? .both
    }
}

/// "acme", "dev.azure.com/acme" or the full address all name the same organization.
enum AzureDevOpsAddress {
    static func organizationURL(_ text: String) -> URL? {
        var name = text.trimmingCharacters(in: .whitespacesAndNewlines)
        for prefix in ["https://", "http://", "dev.azure.com/"] where name.lowercased().hasPrefix(prefix) { name.removeFirst(prefix.count) }
        name = String(name.split(separator: "/").first ?? "")
        guard name.wholeMatch(of: #/[A-Za-z0-9][A-Za-z0-9-]*/#) != nil else { return nil }
        return URL(string: "https://dev.azure.com/\(name)")
    }
}
