import SwiftUI

/// The first screen: sign in with Apple, GitHub, Microsoft or a passkey through Clerk, then claim the server if it
/// has no owner yet, then Connect your work. A server without Clerk falls back to the passkey web sign-in.
struct SignInView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let account = app.account
        Group {
            switch account.stage {
            case .choose: SignInChooser()
            case .claim: ClaimServerView()
            case .connect: ConnectWorkView(onDone: { Task { await account.finishSignIn() } })
            }
        }
        .task {
            await account.loadServerInfo()
            #if DEBUG
            switch LaunchOverrides.route {
            case "signin/claim": account.stage = .claim
            case "signin/connect": account.stage = .connect
            default: break
            }
            #endif
        }
    }
}

private struct SignInChooser: View {
    @Environment(AppModel.self) private var app
    @Environment(\.colorScheme) private var scheme
    @State private var editingServer = false

    var body: some View {
        let account = app.account
        VStack(spacing: 0) {
            Spacer(minLength: 40)
            BDAppTile(size: 104)
                .shadow(color: BD.brandIndigo.opacity(scheme == .dark ? 0.45 : 0.25), radius: 40)
            Text("BorgDock")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(BD.text)
                .padding(.top, 26)
            Text("Your pull requests, work items and agents.\nOn every device.")
                .font(.system(size: 17))
                .foregroundStyle(BD.text2)
                .multilineTextAlignment(.center)
                .padding(.top, 10)
            Spacer(minLength: 40)
            if let message = account.signInError ?? app.signedOutReason ?? account.serverInfoError {
                Text(message)
                    .font(.system(size: 14))
                    .foregroundStyle(BD.red)
                    .multilineTextAlignment(.center)
                    .padding(.bottom, 12)
                    .accessibilityIdentifier("sign-in-error")
            }
            if let info = account.serverInfo, info.clerk == nil {
                passkeyFallback
            } else {
                providers
            }
            Button { editingServer = true } label: {
                Text("Accounts by Clerk · \(ServerSettings.displayName(app.serverURL))")
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            .font(.system(size: 13))
            .foregroundStyle(BD.text3)
            .padding(.top, 18)
            .accessibilityHint("Change the server")
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background {
            RadialGradient(colors: [BD.brandIndigo.opacity(scheme == .dark ? 0.22 : 0.12), .clear], center: .init(x: 0.5, y: 0.22), startRadius: 0, endRadius: 360)
                .ignoresSafeArea()
        }
        .background(BD.bg.ignoresSafeArea())
        .serverEditor(isPresented: $editingServer)
    }

    private var providers: some View {
        let account = app.account
        let busy = account.busyProvider
        return VStack(spacing: 12) {
            // Only what the Clerk application has turned on; Microsoft stays hidden until it's enabled there.
            let offered = account.enabledProviders ?? [.apple, .github, .passkey]
            if offered.contains(.apple) {
                providerButton(.apple, title: "Continue with Apple", icon: Image(systemName: "apple.logo"), style: .contrast)
            }
            if offered.contains(.github) {
                providerButton(.github, title: "Continue with GitHub", icon: Image(systemName: "chevron.left.forwardslash.chevron.right"), style: .fill)
            }
            if offered.contains(.microsoft) {
                providerButton(.microsoft, title: "Continue with Microsoft", icon: nil, style: .fill)
            }
            if offered.contains(.passkey) {
                HStack(spacing: 12) {
                    BD.separator.frame(height: 0.5)
                    Text("or").font(.system(size: 14)).foregroundStyle(BD.text3)
                    BD.separator.frame(height: 0.5)
                }
                .padding(.vertical, 4)
                providerButton(.passkey, title: "Sign in with a passkey", icon: Image(systemName: "person.badge.key"), style: .outline)
            }
        }
        .disabled(busy != nil || account.serverInfo == nil)
    }

    private var passkeyFallback: some View {
        VStack(spacing: 10) {
            providerButton(.passkey, title: "Sign in with a passkey", icon: Image(systemName: "person.badge.key"), style: .contrast) {
                Task { await app.account.signInWithWebPasskey() }
            }
            Text("This server has no Clerk application, so it uses its own passkeys.")
                .font(.system(size: 13))
                .foregroundStyle(BD.text3)
                .multilineTextAlignment(.center)
        }
    }

    private enum ProviderStyle { case contrast, fill, outline }

    private func providerButton(_ provider: SignInProvider, title: String, icon: Image?, style: ProviderStyle, action: (() -> Void)? = nil) -> some View {
        Button {
            if let action { action() } else { Task { await app.account.signIn(with: provider) } }
        } label: {
            HStack(spacing: 10) {
                if app.account.busyProvider == provider {
                    ProgressView().tint(style == .contrast ? BD.bg : BD.text)
                } else if let icon {
                    icon.font(.system(size: 18, weight: .semibold))
                } else {
                    MicrosoftLogo().frame(width: 18, height: 18)
                }
                Text(title)
            }
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(style == .contrast ? BD.bg : BD.text)
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background {
                switch style {
                case .contrast: Capsule().fill(BD.text)
                case .fill: Capsule().fill(BD.fill2)
                case .outline: Capsule().strokeBorder(BD.separator, lineWidth: 1)
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("sign-in-\(provider.rawValue)")
    }
}

/// Microsoft's four squares.
private struct MicrosoftLogo: View {
    var body: some View {
        Grid(horizontalSpacing: 1.5, verticalSpacing: 1.5) {
            GridRow { Color(hex: 0xF25022); Color(hex: 0x7FBA00) }
            GridRow { Color(hex: 0x00A4EF); Color(hex: 0xFFB900) }
        }
        .accessibilityHidden(true)
    }
}

/// The server has no owner yet. Only someone at a machine can claim it: they see the pairing code there.
struct ClaimServerView: View {
    @Environment(AppModel.self) private var app
    @State private var scanning = false

    var body: some View {
        let account = app.account
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Claim this server")
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(BD.text)
                    Text("Nobody owns \(account.serverInfo?.name ?? "this BorgDock server") yet. Prove you're at one of its machines and it becomes yours: run npx borgdock connect there, then scan the code it shows.")
                        .font(.system(size: 16))
                        .foregroundStyle(BD.text2)
                        .padding(.top, 8)
                }
                .padding(.horizontal, 20)
                .frame(maxWidth: .infinity, alignment: .leading)
                PairingCodeEntry(busy: account.isClaiming, error: account.signInError) { link in
                    Task { await account.claim(with: link) }
                }
                .padding(.top, 8)
            }
            .background(BD.bg)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { Task { await account.cancelClaim() } } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Cancel")
                }
            }
            .tint(BD.text)
        }
    }
}

/// An alert with a text field for the server address. Changing it signs out.
private struct ServerEditor: ViewModifier {
    @Binding var isPresented: Bool
    @Environment(AppModel.self) private var app
    @State private var text = ""
    @State private var invalid = false

    func body(content: Content) -> some View {
        content
            .alert("Server address", isPresented: $isPresented) {
                TextField("https://host/borgdock", text: $text)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                Button("Save") {
                    if let url = ServerSettings.normalize(text) {
                        app.changeServer(to: url)
                        Task { await app.account.loadServerInfo() }
                    } else {
                        invalid = true
                    }
                }
                Button("Use the default") {
                    app.changeServer(to: ServerSettings.defaultURL)
                    Task { await app.account.loadServerInfo() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(app.isSignedIn ? "Changing the server signs you out on this device." : "Your BorgDock server.")
            }
            .alert("That isn't a web address", isPresented: $invalid) {
                Button("OK") {}
            } message: {
                Text("Use something like https://my-mac.tailnet.ts.net/borgdock.")
            }
            .onChange(of: isPresented) { _, shown in
                if shown { text = app.serverURL.absoluteString }
            }
    }
}

extension View {
    func serverEditor(isPresented: Binding<Bool>) -> some View {
        modifier(ServerEditor(isPresented: isPresented))
    }
}
