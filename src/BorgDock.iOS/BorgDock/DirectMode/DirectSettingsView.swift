import SwiftUI

/// BorgDock Review's settings: the GitHub accounts and the Azure DevOps organization it reads with, which
/// repositories it lists, and Face ID before a merge or an approval.
struct DirectSettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let session: DirectSession

    @State private var addingAccount = false
    @State private var connectingAzureDevOps = false

    var body: some View {
        @Bindable var session = session
        List {
            Section {
                ForEach(session.credentials.gitHub) { account in
                    HStack(spacing: 12) {
                        PersonAvatar(name: account.name ?? account.login, size: 34)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(account.name ?? account.login).font(.system(size: 16, weight: .semibold)).foregroundStyle(BD.text)
                            Text(verbatim: "@\(account.login)").font(.system(size: 14)).foregroundStyle(BD.text2)
                        }
                    }
                    .swipeActions {
                        Button("Remove", role: .destructive) { remove(account) }
                    }
                    .accessibilityIdentifier("account-\(account.login)")
                }
                Button { addingAccount = true } label: { Label("Add a GitHub account", systemImage: "plus") }
                    .accessibilityIdentifier("add-account")
            } header: {
                Text("GitHub")
            } footer: {
                Text("Each account reads the pull requests it can see. Swipe an account to remove it.")
            }

            Section {
                if let connection = session.credentials.azureDevOps {
                    LabeledContent("Organization", value: connection.organizationURL.lastPathComponent)
                    LabeledContent("Project", value: connection.project)
                    Button("Disconnect", role: .destructive) { session.disconnectAzureDevOps() }
                } else {
                    Button { connectingAzureDevOps = true } label: { Label("Connect Azure DevOps", systemImage: "plus") }
                        .accessibilityIdentifier("connect-ado")
                }
            } header: {
                Text("Azure DevOps")
            } footer: {
                Text("Opens the work items a pull request names (AB#123) inside the app.")
            }

            Section("Pull requests") {
                NavigationLink(value: Route.repositories) { Label("Repositories", systemImage: "folder") }
            }

            Section {
                Toggle("Face ID to merge and approve", isOn: $session.faceIdForActions)
            } footer: {
                Text("Asks before a merge or an approval leaves this iPhone.")
            }

            Section {
                LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
        }
        .tint(BD.accent)
        .onChange(of: session.faceIdForActions) { Task { await app.focus.loadPreferences() } }
        .sheet(isPresented: $addingAccount) {
            NavigationStack {
                ScrollView {
                    GitHubTokenForm(session: session, buttonTitle: "Add account") { _ in
                        addingAccount = false
                        Task { await app.focus.load(reportErrors: true, fresh: true) }
                    }
                    .padding(20)
                }
                .background(BD.bg)
                .navigationTitle("Add a GitHub account")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { addingAccount = false } } }
            }
        }
        .sheet(isPresented: $connectingAzureDevOps) {
            NavigationStack { AzureDevOpsForm(session: session) { connectingAzureDevOps = false } }
        }
    }

    private func remove(_ account: DirectCredentials.GitHub) {
        session.removeGitHubAccount(account.login)
        if session.hasGitHub {
            Task { await app.focus.load(reportErrors: true, fresh: true) }
        } else {
            app.focus.forget()
            app.router.reset()
        }
    }
}

/// Organization, project and a personal access token; checked with Azure DevOps before it is kept.
struct AzureDevOpsForm: View {
    let session: DirectSession
    let onDone: () -> Void

    @State private var organization = ""
    @State private var project = ""
    @State private var token = ""
    @State private var error: String?
    @State private var checking = false

    var body: some View {
        Form {
            Section {
                TextField("Organization", text: $organization, prompt: Text("acme or dev.azure.com/acme"))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("ado-organization")
                TextField("Project", text: $project)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("ado-project")
                SecureField("Personal access token", text: $token)
                    .textContentType(.password)
                    .accessibilityIdentifier("ado-token")
            } footer: {
                Text("The token needs **Work Items: Read & write** (write only to post comments). It stays in this iPhone's Keychain.")
            }
            if let error {
                Section { Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(BD.red) }
            }
            Section {
                Button { Task { await connect() } } label: {
                    if checking { ProgressView() } else { Text("Connect") }
                }
                .disabled(checking || connection == nil)
                .accessibilityIdentifier("ado-connect")
            }
        }
        .navigationTitle("Azure DevOps")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onDone) } }
    }

    private var connection: AdoConnection? {
        let token = token.trimmingCharacters(in: .whitespacesAndNewlines)
        let project = project.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty, !project.isEmpty, let url = AzureDevOpsAddress.organizationURL(organization) else { return nil }
        return AdoConnection(organizationURL: url, project: project, credential: .personalAccessToken(token))
    }

    private func connect() async {
        guard let connection, !checking else { return }
        checking = true
        defer { checking = false }
        do {
            try await session.connectAzureDevOps(connection)
            onDone()
        } catch {
            self.error = error.localizedDescription
        }
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

/// The repositories every open pull request is listed of, yours or not, and which searches add the ones that involve you.
struct WatchedRepositoriesView: View {
    @Environment(AppModel.self) private var app
    let session: DirectSession

    @State private var repositories: PrRepositories?
    @State private var adding = ""
    @State private var error: String?

    var body: some View {
        List {
            Section {
                ForEach(repositories?.repositories ?? []) { repository in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(repository.name).font(.system(size: 16, weight: .medium)).foregroundStyle(BD.text)
                        Text(repository.ok ? "\(repository.open) open" : repository.error ?? "Couldn't be read")
                            .font(.system(size: 13))
                            .foregroundStyle(repository.ok ? BD.text2 : BD.red)
                    }
                    .accessibilityIdentifier("repository-\(repository.name)")
                }
                .onDelete { offsets in
                    var names = repositories?.repositories.map(\.name) ?? []
                    names.remove(atOffsets: offsets)
                    Task { await watch(names) }
                }
                HStack {
                    TextField("owner/repository", text: $adding)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .onSubmit { Task { await add() } }
                        .accessibilityIdentifier("repository-name")
                    Button("Add") { Task { await add() } }
                        .disabled(GitHubSettings.cleanRepositories([adding]).isEmpty)
                }
            } header: {
                Text("Watched repositories")
            } footer: {
                Text(error ?? "Every open pull request of these is listed, also the ones that don't involve you.")
                    .foregroundStyle(error == nil ? BD.text2 : BD.red)
            }

            if let repositories {
                Section {
                    Toggle("Pull requests that involve me", isOn: preference(\.includeInvolving, current: repositories.includeInvolving))
                    Toggle("Review requests to my teams", isOn: preference(\.includeTeamRequests, current: repositories.includeTeamRequests))
                        .disabled(!repositories.includeInvolving)
                } footer: {
                    Text("From any repository: yours, the ones you were asked to review and the ones you reviewed.")
                }
                if repositories.cutOff {
                    Section { Label("GitHub returned more pull requests than fit in one read; the list is cut off.", systemImage: "scissors").foregroundStyle(BD.text2) }
                }
            }
        }
        .navigationTitle("Repositories")
        .navigationBarTitleDisplayMode(.inline)
        .tint(BD.accent)
        .task { repositories = await session.gitHub.repositories() }
    }

    private func add() async {
        let names = GitHubSettings.cleanRepositories([adding])
        guard !names.isEmpty else {
            error = "Write it as owner/repository."
            return
        }
        adding = ""
        await watch((repositories?.repositories.map(\.name) ?? []) + names)
    }

    private func watch(_ names: [String]) async {
        error = nil
        repositories = await session.gitHub.watch(names)
        await reload()
    }

    private func preference(_ path: WritableKeyPath<PrRepositoryPreferences, Bool?>, current: Bool) -> Binding<Bool> {
        Binding(get: { current }, set: { value in
            var preferences = PrRepositoryPreferences()
            preferences[keyPath: path] = value
            Task {
                repositories = await session.gitHub.setRepositoryPreferences(preferences)
                await reload()
            }
        })
    }

    /// Reads the list with the new settings, then shows what each repository's read found.
    private func reload() async {
        await app.focus.load(reportErrors: true, fresh: true)
        repositories = await session.gitHub.repositories()
    }
}
