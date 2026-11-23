import SwiftUI

// BorgDock Review's first run (design/review-app/mockups.html, "First run and Settings"): what the app needs, in the
// order you'll do it. A GitHub token per account, Azure DevOps for the work items, the repositories to watch.

/// The three steps on one stack. The GitHub account signs you in, so the session says the setup is still on screen
/// until its last step is done.
struct SetupFlow: View {
    @Environment(AppModel.self) private var app
    let session: DirectSession
    @State private var path: [Step] = []

    enum Step: Hashable {
        case gitHub, azureDevOps, repositories
    }

    var body: some View {
        NavigationStack(path: $path) {
            WelcomeView { start() }
                .navigationDestination(for: Step.self) { step in
                    switch step {
                    case .gitHub:
                        GitHubTokenScreen(session: session, step: "Step 1 of 3") { _ in
                            path.append(.azureDevOps)
                            // The list is read while you do the next two steps: the repositories you work in start switched on.
                            Task { await app.focus.load(fresh: true) }
                        }
                    case .azureDevOps:
                        AzureDevOpsScreen(session: session, step: "Step 2 of 3") { path.append(.repositories) }
                    case .repositories:
                        RepositoryPicker(session: session, step: "Step 3 of 3") { session.isSettingUp = false }
                    }
                }
        }
        .tint(BD.accent)
        #if DEBUG
        .task {
            guard let step = SetupDebugRoute.step() else { return }
            session.isSettingUp = true
            path = step
        }
        #endif
    }

    private func start() {
        session.isSettingUp = true
        path = [session.hasGitHub ? .azureDevOps : .gitHub]
    }
}

/// What the app does and what it needs.
struct WelcomeView: View {
    let connect: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                BDAppTile(size: 60)
                Text("BorgDock Review")
                    .font(.system(size: 32, weight: .bold))
                    .tracking(-0.8)
                    .foregroundStyle(BD.text)
                    .padding(.top, 14)
                Text("Your pull requests, straight from GitHub and Azure DevOps. No server and no sign-up: your tokens stay on this iPhone.")
                    .font(.system(size: 16))
                    .foregroundStyle(BD.text2)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
                VStack(spacing: 0) {
                    step(1, "GitHub", "A token for each account you review with")
                    divider
                    step(2, "Azure DevOps", "The work item behind an AB# chip", optional: true)
                    divider
                    step(3, "Repositories", "Which ones to watch")
                }
                .bdCard(radius: 22)
                .padding(.top, 26)
            }
            .padding(.horizontal, 20)
            .padding(.top, 44)
            .padding(.bottom, 24)
        }
        .background(BD.bg)
        .safeAreaInset(edge: .bottom) {
            Button(action: connect) { Label("Connect GitHub", systemImage: "arrow.triangle.pull") }
                .buttonStyle(.bdPrimary)
                .padding(.horizontal, 20)
                .padding(.bottom, 8)
                .accessibilityIdentifier("welcome-connect")
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private var divider: some View {
        Rectangle().fill(BD.separator).frame(height: 0.5).padding(.leading, 58)
    }

    private func step(_ number: Int, _ title: String, _ detail: String, optional: Bool = false) -> some View {
        HStack(spacing: 14) {
            Text(verbatim: "\(number)")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(BD.accentText)
                .frame(width: 28, height: 28)
                .background(BD.accentSoft, in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(BD.text)
                Text(detail).font(.system(size: 13.5)).foregroundStyle(BD.text2).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 6)
            if optional { ToneChip(text: "Optional", small: true) }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 62)
        .accessibilityElement(children: .combine)
    }
}

/// "GitHub account" over "Step 1 of 3": the title of a setup step.
struct SetupTitle: ToolbarContent {
    let title: String
    var step: String?

    var body: some ToolbarContent {
        ToolbarItem(placement: .principal) {
            VStack(spacing: 1) {
                Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(BD.text)
                if let step { Text(step).font(.system(size: 12)).foregroundStyle(BD.text2) }
            }
            .accessibilityElement(children: .combine)
        }
    }
}

/// "Token", "This token", "Show it as": the small label over a group of a setup screen.
struct SetupLabel: View {
    let title: String
    var trailing: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(BD.text2)
            Spacer(minLength: 8)
            if let trailing { Text(trailing).font(.system(size: 13, weight: .medium)).foregroundStyle(BD.text3).monospacedDigit() }
        }
        .padding(.horizontal, 4)
        .padding(.top, 20)
        .padding(.bottom, 8)
    }
}

/// A row that leaves the app: "Create a token on github.com", what the page opens with, and the arrow.
struct SetupLinkRow: View {
    let title: String
    let detail: String
    let url: URL

    var body: some View {
        Link(destination: url) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.system(size: 15.5, weight: .semibold)).foregroundStyle(BD.accentText)
                    Text(detail).font(.system(size: 13)).foregroundStyle(BD.text2).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 6)
                Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(BD.text3)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// A secret with Paste next to it: a token is made on another device and arrives through the shared clipboard.
struct TokenField: View {
    let placeholder: String
    @Binding var text: String
    var identifier: String

    var body: some View {
        HStack(spacing: 10) {
            SecureField(placeholder, text: $text)
                .textContentType(.password)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 15.5, design: .monospaced))
                .foregroundStyle(BD.text)
                .accessibilityIdentifier(identifier)
            Button {
                if let pasted = UIPasteboard.general.string { text = pasted.trimmingCharacters(in: .whitespacesAndNewlines) }
            } label: {
                Label("Paste", systemImage: "doc.on.clipboard")
                    .labelStyle(TightLabelStyle(spacing: 5))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(BD.accentText)
                    .padding(.horizontal, 12)
                    .frame(height: 34)
                    .background(BD.accentSoft, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier(identifier + "-paste")
        }
        .padding(.leading, 16)
        .padding(.trailing, 10)
        .frame(minHeight: 54)
    }
}

#if DEBUG
/// `-BorgDockRoute setup/<github|ado|repositories>` opens a step of the first run, for screenshots; with
/// `-BorgDockFixtureMode fresh` the app starts without accounts, on Welcome.
enum SetupDebugRoute {
    @MainActor
    static func step() -> [SetupFlow.Step]? {
        guard let route = LaunchOverrides.route, route.hasPrefix("setup/") else { return nil }
        switch route.dropFirst(6) {
        case "github": return [.gitHub]
        case "ado": return [.gitHub, .azureDevOps]
        case "repositories": return [.gitHub, .azureDevOps, .repositories]
        default: return nil
        }
    }

    /// The token the screenshots check: made up, and the fixture answers for it.
    static let token = "github_pat_11ACME0000fixture0000token0000review"

    @MainActor
    static var isOn: Bool { LaunchOverrides.route?.hasPrefix("setup/") == true }
}
#endif
