#if DEBUG
import Foundation

/// `-BorgDockSampleVault 1`: a sync folder in the app's container with a few notes and a workstream, for
/// screenshots against the sample server (e2e/fixtures/30-notes.mjs). Today's note is left out so the app makes
/// it with the digest, then fills in the sample sections.
@MainActor
enum SampleVault {
    private(set) static var active = false

    static func installIfRequested() -> URL? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-BorgDockSampleVault"), arguments.indices.contains(index + 1), arguments[index + 1] != "0",
              let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        else { return nil }
        let root = documents.appendingPathComponent("Sample Sync", isDirectory: true)
        let notes = root.appendingPathComponent(VaultLocation.notesFolderName, isDirectory: true)
        let workstreams = root.appendingPathComponent(VaultLocation.workstreamsFolderName, isDirectory: true)
        try? FileManager.default.removeItem(at: root)
        let yesterday = Date.now.addingTimeInterval(-24 * 3600)
        let files: [(URL, String)] = [
            (notes.appendingPathComponent(NoteEdits.dailyPath(yesterday)), """
            # \(NoteEdits.dailyTitle(yesterday))

            ## Captured
            - 16:10 Lars thinks the coupon merge changed the payment mock · shop/shop#3690
            """),
            (notes.appendingPathComponent("Offline basket decisions.md"), """
            # Offline basket decisions

            Part of [Offline-first mobile checkout](borgdock://workstreams/\(workstreamId)).

            ## Storage
            IndexedDB via idb-keyval, not the SQLite plugin: it works in the WebView and needs no native plugin. See AB#61044.

            ## Conflicts
            Still open: newest line wins, or the server wins? The agent's proposal is on shop#3712.
            """),
            (notes.appendingPathComponent("Checkout decisions.md"), """
            # Checkout decisions

            - Hard declines clear the basket. Timeouts keep it.
            - 3-D Secure aborts keep the basket too. See [[Offline basket decisions]].
            """),
            (notes.appendingPathComponent("Meetings/Demo prep.md"), """
            - [ ] Record the checkout flow on a slow network
            - [ ] Read [[Checkout decisions]]
            """),
            (workstreams.appendingPathComponent("\(workstreamId).json"), workstreamJSON),
        ]
        for (url, text) in files {
            try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? Data(text.utf8).write(to: url)
        }
        active = true
        let context = CaptureContext(kind: .pr, key: "shop/shop#3712", title: "Checkout: keep the basket", at: .now)
        if let data = try? JSONEncoder().encode(context) { UserDefaults.standard.set(data, forKey: "notes.captureContext") }
        return root
    }

    /// The sections under the digest in the mockup's daily note.
    static func fillToday(_ store: NotesStore, path: String) async {
        guard active, let text = store.texts[path], !text.contains("## Checkout") else { return }
        let body = """

        ## Checkout
        The timeout fix in shop#3712 waits on the e2e fix. Lars is on the master failure.
        - [ ] Ask Tom whether hard declines should keep the basket
        - [x] Answer the agent on AB#61044
        - [ ] Read [[Offline basket decisions]] before the demo

        ## Ideas
        Quick Review on the phone: start with re-reviews, they're short.
        """
        await store.save(path, text: text.trimmingCharacters(in: .newlines) + "\n" + body + "\n")
    }

    static let workstreamId = "6f1c2a4e-8b0d-4c3e-9a51-2d7e4b9c1f08"

    static var workstreamJSON: String {
        """
        {
          "schema": 1, "revision": 14, "updatedAt": "2026-10-30T18:20:00.000Z",
          "writtenBy": { "deviceId": "desk", "deviceLabel": "Desktop" },
          "id": "\(workstreamId)",
          "title": "Offline-first mobile checkout",
          "goal": "Shoppers keep their basket without a connection and pay once they're back online.",
          "status": "active", "pinned": true,
          "members": [
            { "key": "gh:github.com/shop/shop#3650", "ref": { "kind": "github-pr", "owner": "shop", "repo": "shop", "number": 3650 }, "role": "primary", "label": "Basket: persist across restarts", "note": "", "addedAt": "2026-10-20T09:00:00Z", "addedBy": "you" },
            { "key": "ado:acme#60940", "ref": { "kind": "ado-item", "organization": "acme", "project": "Shop", "id": 60940 }, "role": "supporting", "label": "Refresh prices on reconnect", "note": "", "addedAt": "2026-10-20T09:00:00Z", "addedBy": "you" },
            { "key": "ado:acme#61044", "ref": { "kind": "ado-item", "organization": "acme", "project": "Shop", "id": 61044 }, "role": "primary", "label": "Replay offline changes", "note": "", "addedAt": "2026-10-21T09:00:00Z", "addedBy": "you" },
            { "key": "gh:github.com/shop/shop#3712", "ref": { "kind": "github-pr", "owner": "shop", "repo": "shop", "number": 3712 }, "role": "primary", "label": "Checkout: keep the basket on timeout", "note": "", "addedAt": "2026-10-28T09:00:00Z", "addedBy": "suggestion" },
            { "key": "url:https://example.invalid/indexeddb", "ref": { "kind": "link", "url": "https://example.invalid/indexeddb", "title": "IndexedDB via idb-keyval" }, "role": "primary", "label": "IndexedDB via idb-keyval", "note": "", "addedAt": "2026-10-21T09:00:00Z", "addedBy": "you" },
            { "key": "url:https://example.invalid/sqlite", "ref": { "kind": "link", "url": "https://example.invalid/sqlite", "title": "SQLite plugin" }, "role": "superseded", "label": "SQLite plugin", "note": "", "addedAt": "2026-10-21T09:00:00Z", "addedBy": "you" },
            { "key": "t3:mac-mini/thread-newest", "ref": { "kind": "t3-thread", "environmentId": "mac-mini", "threadId": "thread-newest", "hostId": "local" }, "role": "context", "label": "Newest line wins", "note": "", "addedAt": "2026-10-29T09:00:00Z", "addedBy": "run" },
            { "key": "t3:mac-mini/thread-server", "ref": { "kind": "t3-thread", "environmentId": "mac-mini", "threadId": "thread-server", "hostId": "local" }, "role": "context", "label": "Server wins", "note": "", "addedAt": "2026-10-29T09:00:00Z", "addedBy": "run" }
          ],
          "outcomes": [
            { "id": "o1", "title": "Basket survives an app restart", "required": true, "rules": [{ "id": "r1", "kind": "pr-merged", "target": "gh:github.com/shop/shop#3650", "value": null }], "verification": { "state": "verified", "at": "2026-10-24T10:00:00Z", "device": "desk", "facts": [], "evidence": [], "note": "" } },
            { "id": "o2", "title": "Prices refresh on reconnect", "required": true, "rules": [{ "id": "r2", "kind": "item-category", "target": "ado:acme#60940", "value": "Completed" }], "verification": { "state": "verified", "at": "2026-10-27T10:00:00Z", "device": "desk", "facts": [], "evidence": [], "note": "" } },
            { "id": "o3", "title": "Offline changes replay on reconnect", "required": true, "rules": [{ "id": "r3", "kind": "item-state", "target": "ado:acme#61044", "value": "Ready For QA" }], "verification": { "state": "unverified", "at": null, "device": null, "facts": [], "evidence": [], "note": "" } },
            { "id": "o4", "title": "Payment timeouts keep the basket", "required": true, "rules": [{ "id": "r4", "kind": "pr-checks-green", "target": "gh:github.com/shop/shop#3712", "value": null }], "verification": { "state": "invalidated", "at": "2026-10-30T17:00:00Z", "device": "desk", "facts": [], "evidence": [], "note": "" } }
          ],
          "relations": [],
          "decisions": [
            { "id": "d1", "question": "Storage: IndexedDB, not SQLite", "options": ["url:https://example.invalid/indexeddb", "url:https://example.invalid/sqlite"], "status": "decided", "chosen": "url:https://example.invalid/indexeddb", "rationale": "Works in the WebView, no native plugin. [[Offline basket decisions]]", "decidedAt": "2026-10-22T11:00:00Z", "rolesBefore": {} },
            { "id": "d2", "question": "Conflicts: newest line or server wins?", "options": ["t3:mac-mini/thread-newest", "t3:mac-mini/thread-server"], "status": "open", "chosen": null, "rationale": "", "decidedAt": null, "rolesBefore": {} }
          ],
          "nextAction": { "text": "Answer the agent on AB#61044", "target": "ado:acme#61044", "setAt": "2026-10-30T09:00:00Z", "setBy": "you" },
          "proposals": [
            { "id": "p1", "runKey": "t3:mac-mini/review-1", "at": "2026-10-30T16:00:00Z", "dropped": [], "items": [
              { "id": "pi1", "kind": "decision", "status": "open", "why": "The server already orders lines by revision, so newest-wins would drop a price change made while offline.", "decisionId": "d2", "choose": "t3:mac-mini/thread-server" }
            ] }
          ],
          "runs": [], "dismissedSuggestions": [], "log": [],
          "createdAt": "2026-10-20T09:00:00Z", "completedAt": null
        }
        """
    }
}
#endif
