import SwiftUI

/// BorgDock Review's first screen: a GitHub token is all it takes to start. Azure DevOps is added in Settings, or the
/// first time a work item is opened.
struct ConnectView: View {
    let session: DirectSession

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 10) {
                    BDAppTile(size: 60)
                    Text("Review pull requests")
                        .font(.system(size: 32, weight: .bold))
                        .tracking(-0.8)
                        .foregroundStyle(BD.text)
                    Text("BorgDock Review reads GitHub straight from this iPhone. Your token stays in its Keychain.")
                        .font(.system(size: 16))
                        .foregroundStyle(BD.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                GitHubTokenForm(session: session, buttonTitle: "Connect GitHub")
            }
            .padding(.horizontal, 20)
            .padding(.top, 48)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(BD.bg)
    }
}

/// A token field with what the token needs, and where to make one. Used on the first screen and by Add account.
struct GitHubTokenForm: View {
    let session: DirectSession
    let buttonTitle: String
    var onAdded: (Person) -> Void = { _ in }

    @State private var token = ""
    @State private var error: String?
    @State private var checking = false
    @FocusState private var focused: Bool

    private static let newTokenURL = URL(string: "https://github.com/settings/tokens/new?scopes=repo,read:org&description=BorgDock%20Review")!

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SecureField("GitHub token", text: $token)
                .textContentType(.password)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 17, design: .monospaced))
                .focused($focused)
                .submitLabel(.go)
                .onSubmit { Task { await connect() } }
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(BD.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(error == nil ? BD.separator : BD.red, lineWidth: error == nil ? 0.5 : 1))
                .accessibilityIdentifier("github-token")
            if let error {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(BD.red)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button { Task { await connect() } } label: {
                if checking { ProgressView().tint(.white) } else { Text(buttonTitle) }
            }
            .buttonStyle(.bdPrimary)
            .disabled(checking || token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityIdentifier("github-connect")
            VStack(alignment: .leading, spacing: 8) {
                Text("The token needs the **repo** and **read:org** scopes (a classic token), and your organization's single sign-on authorized when it uses one. Add a token per account: work and personal can sit side by side.")
                    .font(.system(size: 14))
                    .foregroundStyle(BD.text2)
                    .fixedSize(horizontal: false, vertical: true)
                Link(destination: Self.newTokenURL) {
                    Label("Create a token on GitHub", systemImage: "arrow.up.right.square")
                        .font(.system(size: 15, weight: .semibold))
                }
                .tint(BD.accent)
            }
            .padding(.top, 4)
        }
    }

    private func connect() async {
        guard !checking else { return }
        checking = true
        defer { checking = false }
        do {
            let me = try await session.addGitHubAccount(token: token)
            token = ""
            error = nil
            focused = false
            onAdded(me)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
