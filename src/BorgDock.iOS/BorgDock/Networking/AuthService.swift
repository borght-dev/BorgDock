import AuthenticationServices
import UIKit

/// Native sign-in from docs/api.md: PKCE S256 through ASWebAuthenticationSession, then a token exchange.
@MainActor
final class AuthService: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let callbackScheme = "dispatch"

    private var session: ASWebAuthenticationSession?

    func signIn(server: URL, devicePublicKey: String? = nil) async throws -> AppTokenResponse {
        let pkce = PKCE.generate()
        let state = PKCE.randomURLSafeString(byteCount: 16)
        let client = APIClient(baseURL: server, token: nil)
        let startURL = client.url("/auth/app", query: [
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "code_challenge", value: pkce.challenge),
        ])

        let callback = try await presentWebSignIn(startURL)
        let code = try AuthCallback.code(from: callback, expectedState: state)
        return try await client.exchangeAppToken(AppTokenRequest(
            code: code,
            codeVerifier: pkce.verifier,
            deviceName: UIDevice.current.name,
            devicePublicKey: devicePublicKey
        ))
    }

    func cancel() {
        session?.cancel()
        session = nil
    }

    private func presentWebSignIn(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let completion: ASWebAuthenticationSession.CompletionHandler = { callbackURL, error in
                if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: CancellationError())
                } else {
                    continuation.resume(throwing: AuthCallback.Failure.web(error?.localizedDescription ?? "The sign-in page closed."))
                }
            }
            let session: ASWebAuthenticationSession
            if #available(iOS 17.4, *) {
                session = ASWebAuthenticationSession(url: url, callback: .customScheme(Self.callbackScheme), completionHandler: completion)
            } else {
                session = ASWebAuthenticationSession(url: url, callbackURLScheme: Self.callbackScheme, completionHandler: completion)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                continuation.resume(throwing: AuthCallback.Failure.web("The sign-in page couldn't open."))
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) {
            return window
        }
        return ASPresentationAnchor(windowScene: scenes.first!)
    }
}

/// Reads `dispatch://auth?code=<code>&state=<state>` and checks the state.
enum AuthCallback {
    enum Failure: LocalizedError, Equatable {
        case web(String)
        case stateMismatch
        case missingCode(String?)

        var errorDescription: String? {
            switch self {
            case .web(let message): message
            case .stateMismatch: "The sign-in answer didn't match this request. Try again."
            case .missingCode(let reason): reason ?? "The sign-in page didn't send a code. Try again."
            }
        }
    }

    static func code(from url: URL, expectedState: String) throws -> String {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let value = { (name: String) in items.first(where: { $0.name == name })?.value }
        guard value("state") == expectedState else { throw Failure.stateMismatch }
        guard let code = value("code"), !code.isEmpty else { throw Failure.missingCode(value("error")) }
        return code
    }
}
