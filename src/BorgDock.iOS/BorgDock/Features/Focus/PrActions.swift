import SwiftUI

/// The desktop card's buttons as a touch-and-hold menu, filtered to what applies to this pull request.
struct PrContextMenu: View {
    @Environment(AppModel.self) private var app
    let pr: PrSummary

    var body: some View {
        let focus = app.focus
        Section {
            Button { app.router.review(focus.reviewQueue(startingAt: pr)) } label: { Label("Review", systemImage: "eye") }
            if pr.canMerge {
                Button { app.router.present(.merge(pr.prKey)) } label: { Label("Merge…", systemImage: "arrow.triangle.merge") }
            }
            if pr.checks.failed > 0 {
                Button { focus.fixWithClaude(pr) } label: { Label("Fix with Claude", systemImage: "sparkle") }
                Button { Task { await focus.rerunFailed(pr.prKey) } } label: { Label("Rerun failed checks", systemImage: "arrow.counterclockwise") }
            }
            Button { focus.openInT3(pr) } label: { Label("Open in T3…", systemImage: "apple.terminal") }
        }
        Section {
            Button { Task { await focus.snoozeUntilTomorrow(pr.prKey) } } label: { Label("Snooze until tomorrow", systemImage: "moon") }
            ForEach(pr.workItemIds.prefix(2), id: \.self) { id in
                Button { app.router.push(.workItem(ItemRoute(id: id))) } label: { Label("Open AB#" + String(id), systemImage: "rectangle.split.3x1") }
            }
            Button { focus.copyBranch(pr) } label: { Label("Copy branch name", systemImage: "arrow.triangle.branch") }
            Button { focus.openOnGitHub(pr) } label: { Label("Open on GitHub", systemImage: "arrow.up.right.square") }
        }
    }
}

extension FocusStore {
    /// Review this PR, then the others in Needs you that aren't yours.
    func reviewQueue(startingAt pr: PrSummary) -> [PrKey] {
        let others = pullRequests(in: .you).filter { !$0.isMine && $0.key != pr.key }.map(\.prKey)
        return [pr.prKey] + (pr.bucket == .you ? others : [])
    }
}

extension View {
    /// Swipe right to review; swipe left to snooze, or merge when it can be merged. A full swipe left opens the merge
    /// sheet, never a blind merge.
    func prSwipeActions(_ pr: PrSummary, app: AppModel) -> some View {
        self
            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                Button {
                    UserDefaults.standard.set(true, forKey: FocusView.swipeHintKey)
                    app.router.review(app.focus.reviewQueue(startingAt: pr))
                } label: { Label("Review", systemImage: "eye") }
                    .tint(BD.accent)
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                if pr.canMerge {
                    Button {
                        UserDefaults.standard.set(true, forKey: FocusView.swipeHintKey)
                        app.router.present(.merge(pr.prKey))
                    } label: { Label("Merge", systemImage: "arrow.triangle.merge") }
                        .tint(BD.green)
                }
                Button {
                    UserDefaults.standard.set(true, forKey: FocusView.swipeHintKey)
                    Task { await app.focus.snoozeUntilTomorrow(pr.prKey) }
                } label: { Label("Snooze", systemImage: "moon") }
                    .tint(Color(hex: 0x8B8BF5))
            }
    }
}
