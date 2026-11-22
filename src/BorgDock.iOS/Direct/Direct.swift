import Foundation

// GitHub and Azure DevOps read straight from the phone, without the BorgDock server; BorgDock Review runs on this.
//
// - `GitHub/` answers `PullRequestBackend`: the Swift port of the server's `server/src/github/` (searches, the Focus
//   rules, details, files, conversations, reviews, merges). Change a rule on both sides together.
// - `Ado/` answers `WorkItemBackend`: the port of `server/src/ado/` and `borgdock/item-detail.ts`.
//
// Foundation only, no UIKit or SwiftUI: `swift test` in `src/BorgDock.iOS` runs `DirectTests/` on the Mac without a
// simulator, and the Xcode test target runs the same tests.

/// A failure the screens show as it is, with the status the server would have answered.
func directError(_ status: Int, _ message: String) -> APIError {
    switch status {
    case 401: .unauthorized(message)
    case 409: .conflict(message)
    case 502: .upstream(message)
    case 503: .stillLoading(message)
    default: .server(status: status, message: message)
    }
}
