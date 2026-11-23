import SwiftUI

/// Azure DevOps for the work item behind an AB# reference: organization and token first, then the projects come
/// from the token, so there is nothing to mistype. The screen says what the token is and isn't used for. Used by the
/// first run's step 2 (with Skip) and from Settings and a work item that couldn't be read.
struct AzureDevOpsScreen: View {
    @Environment(AppModel.self) private var app
    let session: DirectSession
    var step: String?
    let onDone: () -> Void

    @State private var organization = ""
    @State private var token = ""
    @State private var project = ""
    @State private var lookup = Lookup.idle
    @State private var connecting = false
    @State private var error: String?

    enum Lookup: Equatable {
        case idle, reading
        case found(name: String, projects: [String])
        case failed(String)
    }

    var body: some View {
        let address = AzureDevOpsAddress.organizationURL(organization)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SetupLabel(title: "Where your work items live")
                VStack(spacing: 0) {
                    HStack(spacing: 10) {
                        Text("Organization").font(.system(size: 15.5)).foregroundStyle(BD.text)
                        TextField("acme", text: $organization)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                            .multilineTextAlignment(.trailing)
                            .font(.system(size: 15.5))
                            .foregroundStyle(BD.text)
                            .accessibilityIdentifier("ado-organization")
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 54)
                    if let address {
                        Text(verbatim: "\(address.host() ?? "dev.azure.com")\(address.path())")
                            .font(.system(size: 12.5, design: .monospaced))
                            .foregroundStyle(BD.text3)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                            .padding(.horizontal, 16)
                            .padding(.top, -10)
                            .padding(.bottom, 8)
                    }
                    line
                    TokenField(placeholder: "Personal access token", text: $token, identifier: "ado-token")
                    line
                    projectRow
                    if lookup != .idle {
                        line
                        status
                    }
                }
                .bdCard(radius: 20)

                VStack(spacing: 0) {
                    SetupLinkRow(
                        title: "Create a token on dev.azure.com", detail: "Scope: Work Items, read and write",
                        url: address.flatMap { URL(string: $0.absoluteString + "/_usersSettings/tokens") } ?? URL(string: "https://dev.azure.com")!
                    )
                }
                .bdCard(radius: 20)
                .padding(.top, 12)

                SetupLabel(title: "What it's used for")
                VStack(spacing: 0) {
                    use("checklist", "The item behind an AB# reference", "Title, state, description, discussion")
                    Rectangle().fill(BD.separator).frame(height: 0.5).padding(.leading, 50)
                    use("text.bubble", "Comments you post on an item", "Nothing else is written")
                }
                .bdCard(radius: 20)
                Text("BorgDock Review never changes an item's state or fields. The token stays in this iPhone's keychain.")
                    .font(.system(size: 13))
                    .foregroundStyle(BD.text3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 4)
                    .padding(.top, 8)

                if let error {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(BD.red)
                        .padding(.horizontal, 4)
                        .padding(.top, 14)
                }
                if step == nil, session.hasAzureDevOps {
                    Button("Disconnect Azure DevOps", role: .destructive) {
                        session.disconnectAzureDevOps()
                        onDone()
                    }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(BD.red)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 26)
                    .accessibilityIdentifier("ado-disconnect")
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(BD.bg)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            SetupTitle(title: "Azure DevOps", step: step)
            if step != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Skip", action: onDone).accessibilityIdentifier("ado-skip")
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            SetupBar(disabled: connecting || connection == nil, identifier: "ado-connect") { Task { await connect() } } label: {
                if connecting { ProgressView().tint(.white) } else { Text("Connect \(address?.lastPathComponent ?? "Azure DevOps")") }
            }
        }
        .task(id: organization + "\n" + token) { await readProjects() }
        .onAppear(perform: prefill)
    }

    // MARK: Parts

    private var line: some View {
        Rectangle().fill(BD.separator).frame(height: 0.5).padding(.leading, 16)
    }

    @ViewBuilder
    private var projectRow: some View {
        HStack(spacing: 10) {
            Text("Project").font(.system(size: 15.5)).foregroundStyle(BD.text)
            Spacer(minLength: 8)
            if case .found(_, let projects) = lookup, !projects.isEmpty {
                Menu {
                    Picker("Project", selection: $project) {
                        ForEach(projects, id: \.self) { Text($0).tag($0) }
                    }
                } label: {
                    HStack(spacing: 5) {
                        Text(project.isEmpty ? "Choose" : project).foregroundStyle(project.isEmpty ? BD.text3 : BD.text)
                        Image(systemName: "chevron.up.chevron.down").font(.system(size: 11, weight: .semibold)).foregroundStyle(BD.text3)
                    }
                    .font(.system(size: 15.5))
                }
                .accessibilityIdentifier("ado-project")
            } else {
                // The projects couldn't be listed (a token without that right): the name is typed.
                TextField("Comes from the token", text: $project)
                    .autocorrectionDisabled()
                    .multilineTextAlignment(.trailing)
                    .font(.system(size: 15.5))
                    .foregroundStyle(BD.text)
                    .accessibilityIdentifier("ado-project")
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 54)
    }

    @ViewBuilder
    private var status: some View {
        HStack(spacing: 9) {
            switch lookup {
            case .idle:
                EmptyView()
            case .reading:
                ProgressView().controlSize(.small)
                Text("Asking Azure DevOps…").foregroundStyle(BD.text2)
            case .found(let name, let projects):
                Image(systemName: "checkmark.circle").foregroundStyle(BD.green)
                Text("\(Text("Signed in as \(name.isEmpty ? "you" : name)").fontWeight(.semibold).foregroundStyle(BD.text)) · sees \(projects.count == 1 ? "1 project" : "\(projects.count) projects")")
                    .foregroundStyle(BD.text2)
            case .failed(let message):
                Image(systemName: "xmark.circle").foregroundStyle(BD.red)
                Text(message).foregroundStyle(BD.text).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .font(.system(size: 14))
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("ado-status")
    }

    private func use(_ systemImage: String, _ title: String, _ detail: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage).font(.system(size: 16, weight: .medium)).foregroundStyle(BD.text2).frame(width: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 15, weight: .medium)).foregroundStyle(BD.text)
                Text(detail).font(.system(size: 13)).foregroundStyle(BD.text2)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }

    // MARK: Reading and connecting

    private var connection: AdoConnection? {
        let token = token.trimmingCharacters(in: .whitespacesAndNewlines)
        let project = project.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty, !project.isEmpty, let url = AzureDevOpsAddress.organizationURL(organization) else { return nil }
        return AdoConnection(organizationURL: url, project: project, credential: .personalAccessToken(token))
    }

    private func prefill() {
        if let known = session.credentials.azureDevOps {
            if organization.isEmpty { organization = known.organizationURL.lastPathComponent }
            if project.isEmpty { project = known.project }
        }
        #if DEBUG
        if SetupDebugRoute.isOn, token.isEmpty {
            organization = "acme"
            token = "fixture-ado-token-4f2a"
        }
        #endif
    }

    private func readProjects() async {
        error = nil
        let token = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard token.count >= 8, let url = AzureDevOpsAddress.organizationURL(organization) else {
            lookup = .idle
            return
        }
        try? await Task.sleep(for: .milliseconds(450))
        if Task.isCancelled { return }
        lookup = .reading
        do {
            let found = try await session.azureDevOpsProjects(organization: url, token: token)
            if Task.isCancelled { return }
            lookup = .found(name: found.name, projects: found.projects)
            if !found.projects.contains(project) { project = found.projects.count == 1 ? found.projects[0] : "" }
        } catch is CancellationError {
        } catch {
            lookup = .failed(error.localizedDescription)
        }
    }

    private func connect() async {
        guard let connection, !connecting else { return }
        connecting = true
        defer { connecting = false }
        do {
            try await session.connectAzureDevOps(connection)
            onDone()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
