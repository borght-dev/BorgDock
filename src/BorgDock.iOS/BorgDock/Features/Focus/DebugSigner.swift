#if DEBUG
import Foundation

/// Signs with fixed headers so signed calls reach the sample server (e2e/ui-fixture.mjs) in screenshots.
/// Only installed when the app was launched with `-BorgDockToken` and has no real signer; never in Release.
struct DebugSigner: RequestSigner {
    func headers(method: String, path: String, body: Data) async throws -> [String: String] {
        [
            "X-BorgDock-Signed-At": Date.now.formatted(.iso8601),
            "X-BorgDock-Nonce": UUID().uuidString,
            "X-BorgDock-Signature": "debug-signature",
        ]
    }

    @MainActor
    static func installIfSampleServer(_ app: AppModel) {
        guard app.signer == nil, LaunchOverrides.token != nil else { return }
        app.signer = DebugSigner()
    }
}

/// Screenshot states for the GitHub screens: `-BorgDockRoute i1/<what>/…` (DebugRoute in RootView ignores these).
///   i1/checks/o/r/n · i1/merge/o/r/n · i1/pr/<overview|files|checks|proof|comments>/o/r/n
///   i1/walk/o/r/n/<reviewed> · i1/decide/o/r/n · i1/approving · i1/faceid
@MainActor
enum I1DebugRoute {
    static func apply(_ app: AppModel) async {
        guard let route = LaunchOverrides.route, route.hasPrefix("i1/") else { return }
        let parts = route.split(separator: "/").map(String.init).dropFirst()
        guard let what = parts.first else { return }
        let rest = Array(parts.dropFirst())
        func key(_ values: ArraySlice<String>) -> PrKey? {
            let values = Array(values)
            guard values.count >= 3, let number = Int(values[2]) else { return nil }
            return PrKey(owner: values[0], repo: values[1], number: number)
        }
        for _ in 0..<40 where app.focus.focus == nil { try? await Task.sleep(for: .milliseconds(150)) }
        let store = app.focus
        switch what {
        case "checks":
            guard let key = key(rest[...]) else { return }
            await store.loadDetail(key)
            app.router.present(.checks(key))
        case "merge":
            guard let key = key(rest[...]) else { return }
            await store.loadDetail(key)
            app.router.present(.merge(key))
        case "faceid":
            store.debugFaceID = true
        case "pr":
            guard let tab = rest.first, let key = key(rest.dropFirst()) else { return }
            store.debugPrTab = tab
            app.router.openPullRequest(key)
        case "walk", "decide":
            guard let key = key(rest[...]), let files = await store.loadFiles(key) else { return }
            let count = what == "decide" ? files.files.count : Int(rest.dropFirst(3).first ?? "0") ?? 0
            ReviewedFiles().save(Set(files.files.prefix(count).map(\.path)), prKey: key.key, headSha: files.headSha)
            store.reviewDrafts[key.key] = sampleDraft(files)
            if what == "decide" {
                store.reviewDrafts[key.key]?.body = "Works on iPhone and on the desktop. One question on the banner copy, otherwise good to go."
                store.reopenDecision = key.key
                store.reviewStartPath[key.key] = files.files.last?.path
            } else if files.files.indices.contains(count) {
                store.reviewStartPath[key.key] = files.files[count].path
            }
            app.router.review([key])
        case "approving":
            let first = PrKey(owner: "acme", repo: "shop", number: 3712)
            store.debugReviewPosition = 1
            store.hold.hold(first, label: "Approving #3712…", duration: .seconds(14), send: {}, onUndo: {}, onFailure: { _ in })
            app.router.review([first, PrKey(owner: "borght-dev", repo: "BorgDock", number: 108), PrKey(owner: "acme", repo: "shop-api", number: 2296)])
        default:
            break
        }
    }

    private static func sampleDraft(_ files: PrFiles) -> ReviewDraft {
        var draft = ReviewDraft()
        if let recovery = files.files.first(where: { $0.path.hasSuffix("BasketRecovery.tsx") }) {
            draft.set("Should the banner say how long the provider took? Support keeps asking for it.", path: recovery.path, anchor: DiffAnchor(line: 41, side: .right))
        }
        if let store = files.files.first(where: { $0.path.hasSuffix("basket-store.ts") }) {
            draft.set("Nit: `keep` reads better than `markPending` here.", path: store.path, anchor: DiffAnchor(line: 52, side: .right))
        }
        return draft
    }
}
#endif
