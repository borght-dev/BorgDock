#if DEBUG
import Foundation

/// Screenshot states for Quick Review against the fixture's queue (`e2e/fixtures/90-review-queue.mjs`), mockup
/// sections 05 and 06. `-BorgDockRoute review/<what>`:
///   walk/<n>/<reviewed> · files/<n>/<reviewed> · tests/<n> · brief · decided · error (after the fixture's
///   /preview/fail-files)
@MainActor
enum ReviewDebugRoute {
    private static let queue = [412, 405, 401].map { PrKey(owner: "acme", repo: "shop", number: $0) }
        + [PrKey(owner: "acme", repo: "storefront", number: 377), PrKey(owner: "acme", repo: "shop", number: 3712),
           PrKey(owner: "borght-dev", repo: "BorgDock", number: 108)]

    static func apply(_ route: String, to app: AppModel) async {
        let parts = route.split(separator: "/").map(String.init)
        guard let what = parts.first else { return }
        for _ in 0..<40 where app.focus.focus == nil { try? await Task.sleep(for: .milliseconds(150)) }
        let store = app.focus
        let key = PrKey(owner: "acme", repo: "shop", number: parts.count > 1 ? Int(parts[1]) ?? 412 : 412)
        switch what {
        case "walk", "files":
            guard let files = await store.loadFiles(key) else { return }
            let walk = ReviewWalk(files.files)
            let reviewed = parts.count > 2 ? Int(parts[2]) ?? 0 : 0
            ReviewedFiles().save(Set(walk.files.prefix(reviewed).map(\.path)), prKey: key.key, headSha: files.headSha)
            if walk.files.indices.contains(reviewed) { store.debugReviewStart[key.key] = .file(walk.files[reviewed].path) }
            store.reviewDrafts[key.key] = sampleDraft
            store.debugShowReviewFiles = what == "files"
            app.router.review([key] + queue.filter { $0 != key })
        case "tests":
            guard let files = await store.loadFiles(key) else { return }
            let walk = ReviewWalk(files.files)
            ReviewedFiles().save(Set(walk.files.map(\.path)), prKey: key.key, headSha: files.headSha)
            store.openedFiles[key.key] = Set(walk.tests.filter { ["total.test.ts", "receipt.test.ts", "checkout.spec.ts"].contains($0.path.splitPath.name) }.map(\.path))
            store.debugReviewStart[key.key] = .step(.tests)
            app.router.review([key] + queue.filter { $0 != key })
        case "brief":
            let approved = queue[0]
            store.markReviewOpened(approved)
            store.reviewDecisions[approved.key] = decision(.held, at: .now)
            store.hold.hold(approved, label: "Approving #\(approved.number)", duration: .seconds(14), send: {}, onUndo: {}, onFailure: { _ in })
            store.debugReviewPosition = 1
            app.router.review(queue)
        case "decided":
            let approved = queue[0]
            guard let files = await store.loadFiles(approved), let detail = await store.loadDetail(approved) else { return }
            // Approve and ask for auto-merge on the fixture, so the track reads what GitHub would say afterwards.
            _ = try? await app.api.submitReview(approved, SubmitReviewRequest(event: .approve, body: sampleBody, headSha: files.headSha, comments: sampleDraft.lineComments))
            _ = try? await app.api.merge(approved, MergeRequest(method: detail.defaultMergeMethod, commitTitle: detail.title, commitMessage: "", deleteBranch: true, headSha: files.headSha))
            await store.loadDetail(approved)
            ReviewedFiles().save(Set(files.files.map(\.path)), prKey: approved.key, headSha: files.headSha)
            store.markReviewOpened(approved)
            store.reviewDecisions[approved.key] = decision(.held, at: .now.addingTimeInterval(-65), headSha: files.headSha)
            store.hold.hold(approved, label: "Approving #\(approved.number)", duration: .seconds(30), send: {}, onUndo: {}, onFailure: { _ in })
            app.router.review(queue)
        case "error":
            store.reviewDecisions[queue[1].key] = ReviewDecisionRecord(event: .approve, body: "", lineComments: [], headSha: "9d0e4b1",
                                                                        at: .now.addingTimeInterval(-40), autoMerge: false, status: .posted)
            store.debugReviewPosition = 2
            app.router.review(queue)
        default:
            break
        }
    }

    private static let sampleBody = "Nice catch on the receipt. One nit inline."

    private static var sampleDraft: ReviewDraft {
        var draft = ReviewDraft()
        draft.set("Nit: `lineTotal` could live next to `Money.round`.", path: "src/cart/total.ts", anchor: DiffAnchor(line: 14, side: .right))
        return draft
    }

    private static func decision(_ status: ReviewDecisionRecord.Status, at: Date, headSha: String = "4f2c1a9") -> ReviewDecisionRecord {
        ReviewDecisionRecord(event: .approve, body: sampleBody, lineComments: sampleDraft.lineComments, headSha: headSha, at: at, autoMerge: true, status: status)
    }
}
#endif
