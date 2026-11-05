import Foundation
import LocalAuthentication
import Observation
import UIKit

/// Sign-in, the device key, machines, sources and BorgDock's preferences.
@MainActor
@Observable
final class AccountStore {
    @ObservationIgnored weak var app: AppModel?

    enum SignInStage: Equatable {
        /// The four buttons.
        case choose
        /// The server has no owner yet: scan or type a machine's pairing code to claim it.
        case claim
        /// Signed in; "Connect your work" before the tabs.
        case connect
    }

    private(set) var serverInfo: ServerInfo?
    /// What the Clerk application offers; nil until Clerk has loaded.
    private(set) var enabledProviders: Set<SignInProvider>?
    private(set) var serverInfoError: String?
    var stage: SignInStage = .choose
    private(set) var busyProvider: SignInProvider?
    private(set) var isClaiming = false
    var signInError: String?

    private(set) var account: Account?
    private(set) var sources: Sources?
    private(set) var preferences: BorgDockPreferences?
    private(set) var loadError: String?

    /// A scanned `borgdock://pair` link waiting for the Add a machine sheet or the claim step.
    var pendingPairing: PairingLink?
    /// A scanned `borgdock://link-desktop` link waiting for the Link a desktop sheet.
    var pendingDesktopLink: DesktopLink?

    /// The session from the exchange, kept until "Connect your work" is done.
    @ObservationIgnored private var pendingSession: ClerkExchangeResponse?
    @ObservationIgnored private let auth = AuthService()
    @ObservationIgnored private var deviceKey: DeviceKey?

    private static let faceIdKey = "borgdock.faceIdForActions"

    init() {}

    /// The signed-in client, or the one for the session being set up on the Connect your work screen.
    var api: APIClient? {
        guard let app else { return nil }
        if let pendingSession {
            return APIClient(baseURL: app.serverURL, token: pendingSession.token, signer: app.signer)
        }
        return app.api
    }

    var owner: Owner? { account?.owner ?? pendingSession?.owner }

    // MARK: Launch

    /// On launch while signed in: the signer and the preferences that gate actions.
    func bootstrap() async {
        _ = try? prepareSigner()
        await reload(reportErrors: false)
        await openDebugLaunch()
    }

    /// `-BorgDockRoute launch/<item id>` opens Start an agent for that item (DEBUG screenshots).
    private func openDebugLaunch() async {
        #if DEBUG
        guard let app, let route = LaunchOverrides.route, route.hasPrefix("launch/"), let id = Int(route.dropFirst(7)) else { return }
        app.router.tab = .work
        for _ in 0..<40 where app.overview == nil { try? await Task.sleep(for: .milliseconds(250)) }
        app.router.present(.launch(LaunchContext(itemId: id)))
        #endif
    }

    @discardableResult
    func prepareSigner() throws -> DeviceKey {
        if let deviceKey {
            app?.signer = DeviceRequestSigner(key: deviceKey)
            return deviceKey
        }
        let key = try DeviceKey.loadOrCreate()
        deviceKey = key
        app?.signer = DeviceRequestSigner(key: key)
        return key
    }

    // MARK: Sign-in

    func loadServerInfo() async {
        guard let app else { return }
        do {
            let info = try await APIClient(baseURL: app.serverURL, token: nil).serverInfo()
            serverInfo = info
            serverInfoError = nil
            if let clerk = info.clerk {
                ClerkSignIn.configure(publishableKey: clerk.publishableKey)
                enabledProviders = await ClerkSignIn.enabledProviders()
            }
        } catch is CancellationError {
        } catch {
            serverInfoError = error.localizedDescription
        }
    }

    func signIn(with provider: SignInProvider) async {
        guard busyProvider == nil else { return }
        busyProvider = provider
        signInError = nil
        defer { busyProvider = nil }
        do {
            let clerkToken = try await ClerkSignIn.signIn(with: provider)
            try await exchange(clerkToken: clerkToken, claim: pendingPairing)
        } catch is CancellationError {
        } catch let error as APIError where error.isClaimRequired {
            stage = .claim
        } catch let error as APIError where error.rejectsAccount {
            await ClerkSignIn.signOut()
            signInError = error.localizedDescription
        } catch {
            signInError = error.localizedDescription
        }
    }

    /// Claims an unclaimed server with a machine's pairing code, then finishes the sign-in.
    func claim(with link: PairingLink) async {
        guard !isClaiming else { return }
        isClaiming = true
        signInError = nil
        defer { isClaiming = false }
        do {
            try await exchange(clerkToken: try await ClerkSignIn.sessionToken(), claim: link)
            pendingPairing = nil
        } catch {
            signInError = error.localizedDescription
        }
    }

    private func exchange(clerkToken: String, claim: PairingLink?) async throws {
        guard let app else { return }
        let key = try prepareSigner()
        let request = ClerkExchangeRequest(
            clerkToken: clerkToken,
            deviceName: UIDevice.current.name,
            devicePublicKey: key.publicKeyBase64,
            claim: claim?.proof(devicePublicKey: key.publicKeyBytes)
        )
        pendingSession = try await APIClient(baseURL: app.serverURL, token: nil).exchangeClerkToken(request)
        stage = .connect
        await reload(reportErrors: false)
    }

    /// "Done" on Connect your work: the session becomes the app's.
    func finishSignIn() async {
        guard let app, let session = pendingSession else { return }
        pendingSession = nil
        stage = .choose
        await app.didSignIn(AppTokenResponse(token: session.token, sessionId: session.sessionId))
    }

    /// The passkey web sign-in, for a server without Clerk.
    func signInWithWebPasskey() async {
        guard let app, busyProvider == nil else { return }
        busyProvider = .passkey
        signInError = nil
        defer { busyProvider = nil }
        do {
            let key = try prepareSigner()
            await app.didSignIn(try await auth.signIn(server: app.serverURL, devicePublicKey: key.publicKeyBase64))
        } catch is CancellationError {
        } catch {
            signInError = error.localizedDescription
        }
    }

    /// Back to the providers, signed out of Clerk so the next tap can pick another account.
    func cancelClaim() async {
        stage = .choose
        pendingSession = nil
        await ClerkSignIn.signOut()
    }

    func signOut() async {
        await ClerkSignIn.signOut()
        account = nil
        sources = nil
        preferences = nil
        await app?.signOut()
    }

    // MARK: Machines

    /// borgdock://pair?server=…&code=…&secret=… from a machine's QR code.
    func handlePairingLink(_ url: URL) {
        guard let link = PairingLink(url: url) else {
            app?.toasts.show("That pairing link is incomplete. Scan the code on the machine again.", isError: true)
            return
        }
        pendingPairing = link
        guard let app, app.isSignedIn else {
            if stage == .claim { Task { await claim(with: link) } }
            return
        }
        app.router.present(.addMachine)
    }

    /// Pairs a machine with this device: the server registers it, its connector trusts this device's key.
    func pair(_ link: PairingLink) async throws -> Machine {
        guard let api else { throw APIError.network("Sign in first.") }
        let key = try prepareSigner()
        let proof = link.proof(devicePublicKey: key.publicKeyBytes)
        let machine = try await api.pairMachine(PairMachineRequest(code: proof.code, proof: proof.proof, devicePublicKey: key.publicKeyBase64))
        pendingPairing = nil
        await reload(reportErrors: false)
        return machine
    }

    // MARK: Desktops

    /// Linked BorgDock desktop apps, from the sources.
    var desktops: [LinkedDesktop] { sources?.desktops ?? [] }

    /// borgdock://link-desktop?server=…&code=… from the desktop's QR code.
    func handleDesktopLink(_ url: URL) {
        guard let link = DesktopLink(url: url) else {
            app?.toasts.show("That link has no code. Show the code on your desktop again.", isError: true)
            return
        }
        pendingDesktopLink = link
        guard let app, app.isSignedIn else {
            app?.toasts.show("Sign in first, then scan the desktop's code again.", isError: true)
            return
        }
        app.router.present(.linkDesktop)
    }

    /// Approves the desktop showing this code (signed); it picks up its session on its own.
    func linkDesktop(_ link: DesktopLink) async throws -> DesktopLinkApproval {
        guard let api, let app else { throw APIError.network("Sign in first.") }
        guard link.matches(server: app.serverURL) else {
            throw APIError.network("That desktop uses \(link.server.map(ServerSettings.displayName) ?? "another server"); this iPhone uses \(ServerSettings.displayName(app.serverURL)).")
        }
        try prepareSigner()
        let approval = try await api.approveDesktopLink(code: link.code)
        pendingDesktopLink = nil
        await reload(reportErrors: false)
        return approval
    }

    /// Signs the desktop out: its session is revoked and it stops sharing reads and presence.
    func unlinkDesktop(_ desktop: LinkedDesktop) async {
        guard let api else { return }
        do {
            _ = try await api.revokeSession(id: desktop.sessionId)
            app?.toasts.show("\(desktop.name) is unlinked")
            await reload(reportErrors: false)
        } catch {
            app?.report(error)
        }
    }

    // MARK: Account, sources, preferences

    func reload(reportErrors: Bool = true) async {
        guard let api else { return }
        async let account = Result { try await api.account() }
        async let sources = Result { try await api.sources() }
        async let preferences = Result { try await api.preferences() }
        let results = await (account, sources, preferences)
        if case .success(let value) = results.0 { self.account = value }
        if case .success(let value) = results.1 { self.sources = value }
        if case .success(let value) = results.2 { apply(value) }
        let errors: [Error] = [results.0.failure, results.1.failure, results.2.failure].compactMap { $0 }
        loadError = errors.first?.localizedDescription
        if reportErrors, let error = errors.first { app?.report(error) }
    }

    func update(_ change: (inout BorgDockPreferences) -> Void) async {
        guard var next = preferences, let api else { return }
        let previous = next
        change(&next)
        apply(next)
        do {
            apply(try await api.setPreferences(next))
        } catch {
            apply(previous)
            app?.report(error)
        }
    }

    private func apply(_ value: BorgDockPreferences) {
        preferences = value
        UserDefaults.standard.set(value.faceIdForActions, forKey: Self.faceIdKey)
    }

    /// The last known "Face ID for agents, merges, approvals", so it holds before the preferences load.
    var faceIdForActions: Bool {
        preferences?.faceIdForActions ?? (UserDefaults.standard.object(forKey: Self.faceIdKey) as? Bool ?? true)
    }

    /// Asks for Face ID (or the passcode) before an agent command when the preference is on.
    func authorize(_ reason: String) async -> Bool {
        guard faceIdForActions else { return true }
        #if DEBUG
        if LaunchOverrides.token != nil { return true }
        #endif
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { return true }
        do {
            return try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
        } catch {
            return false
        }
    }
}

private extension Result {
    var failure: Failure? {
        if case .failure(let error) = self { return error }
        return nil
    }
}
