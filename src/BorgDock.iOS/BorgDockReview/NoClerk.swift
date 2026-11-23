import Foundation

// BorgDock Review signs in with tokens and links no Clerk. The account code it shares with BorgDock names Clerk's
// sign-in, so this stands where `Networking/ClerkSignIn.swift` does there; nothing in this app reaches it.

enum SignInProvider: String, CaseIterable, Identifiable, Sendable {
    case apple, github, microsoft, passkey
    var id: String { rawValue }
}

@MainActor
enum ClerkSignIn {
    static func configure(publishableKey: String) {}
    static func enabledProviders() async -> Set<SignInProvider> { [] }
    static func signIn(with provider: SignInProvider) async throws -> String { throw ClerkSignInError.noSession }
    static func sessionToken() async throws -> String { throw ClerkSignInError.noSession }
    static func signOut() async {}
}

enum ClerkSignInError: LocalizedError {
    case incomplete
    case noSession

    var errorDescription: String? { "BorgDock Review has no server sign-in." }
}
