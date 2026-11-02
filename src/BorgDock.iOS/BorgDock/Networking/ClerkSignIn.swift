import ClerkKit
import Foundation

/// The ways to sign in on the first screen. Clerk runs each one natively and hands back a session token,
/// which BorgDock's server trades for its own device session once (POST /api/auth/clerk).
enum SignInProvider: String, CaseIterable, Identifiable, Sendable {
    case apple, github, microsoft, passkey
    var id: String { rawValue }
}

/// Clerk's iOS SDK behind the four buttons. Configured with the publishable key the server reports.
@MainActor
enum ClerkSignIn {
    private static var configuredKey: String?

    static func configure(publishableKey: String) {
        guard configuredKey == nil else { return }
        Clerk.configure(publishableKey: publishableKey)
        configuredKey = publishableKey
    }

    /// The providers the Clerk application has turned on, so the first screen never offers one that would fail.
    /// Falls back to Apple, GitHub and passkeys when Clerk's settings can't be read.
    static func enabledProviders() async -> Set<SignInProvider> {
        try? await waitUntilLoaded()
        guard let settings = Clerk.shared.environment?.userSettings else { return [.apple, .github, .passkey] }
        var providers: Set<SignInProvider> = []
        if settings.social["oauth_apple"]?.enabled == true { providers.insert(.apple) }
        if settings.social["oauth_github"]?.enabled == true { providers.insert(.github) }
        if settings.social["oauth_microsoft"]?.enabled == true { providers.insert(.microsoft) }
        if settings.attributes["passkey"]?.enabled == true { providers.insert(.passkey) }
        return providers
    }

    /// Returns a fresh Clerk session token, running the provider's flow only when Clerk has no session yet.
    /// Clerk keeps its session in the keychain across launches and refuses a second sign-in while one is active.
    static func signIn(with provider: SignInProvider) async throws -> String {
        try await waitUntilLoaded()
        guard !hasActiveSession else { return try await sessionToken() }
        do {
            try await runFlow(provider)
        } catch where hasActiveSession {
            // Clerk turned the flow down because a session became active meanwhile: that session is the sign-in.
        }
        return try await sessionToken()
    }

    private static var hasActiveSession: Bool {
        Clerk.shared.session?.status == .active
    }

    private static func runFlow(_ provider: SignInProvider) async throws {
        let auth = Clerk.shared.auth
        switch provider {
        case .apple:
            try complete(try await auth.signInWithApple())
        case .github:
            try complete(try await auth.signInWithOAuth(provider: .github))
        case .microsoft:
            try complete(try await auth.signInWithOAuth(provider: .microsoft))
        case .passkey:
            let signIn = try await auth.signInWithPasskey()
            guard signIn.status == .complete else { throw ClerkSignInError.incomplete }
        }
    }

    /// A new token for the signed-in Clerk session; they last a minute, so claim retries ask again.
    static func sessionToken() async throws -> String {
        guard let token = try await Clerk.shared.auth.getToken() else { throw ClerkSignInError.noSession }
        return token
    }

    static func signOut() async {
        guard configuredKey != nil else { return }
        try? await Clerk.shared.auth.signOut()
    }

    private static func complete(_ result: TransferFlowResult) throws {
        switch result {
        case .signIn(let signIn) where signIn.status == .complete: return
        case .signUp(let signUp) where signUp.status == .complete: return
        default: throw ClerkSignInError.incomplete
        }
    }

    private static func waitUntilLoaded() async throws {
        for _ in 0..<50 where !Clerk.shared.isLoaded {
            try await Task.sleep(for: .milliseconds(100))
        }
    }
}

enum ClerkSignInError: LocalizedError {
    case incomplete
    case noSession

    var errorDescription: String? {
        switch self {
        case .incomplete: "Clerk needs another step to finish this sign-in. Try another way to sign in."
        case .noSession: "Clerk signed you in but didn't hand back a session. Try again."
        }
    }
}
