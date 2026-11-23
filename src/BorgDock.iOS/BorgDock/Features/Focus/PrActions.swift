import SwiftUI

/// The desktop card's buttons as a touch-and-hold menu, filtered to what applies to this pull request. Review reviews
/// this pull request alone; the author's run reviews their others too, oldest first (the desktop's context menu).
struct PrContextMenu: View {
    @Environment(AppModel.self) private var app
    let pr: PrSummary

    var body: some View {
        let focus = app.focus
        Section {
            if pr.isMine {
                Button { app.router.review([pr.prKey]) } label: { Label("Walk through this PR", systemImage: "eye") }
                    .disabled(pr.state != .open)
            } else {
                Button { app.router.review([pr.prKey]) } label: { Label("Review", systemImage: "eye") }
                Button { app.router.reviewAuthor(pr.author.login, first: pr.prKey) } label: {
                    Label("Review \(pr.author.displayName)'s PRs, oldest first", systemImage: "list.bullet.indent")
                }
                .disabled(pr.isDraft)
            }
            if pr.canMerge {
                Button { app.router.present(.merge(pr.prKey)) } label: { Label("Merge…", systemImage: "arrow.triangle.merge") }
            }
            if pr.checks.failed > 0 {
                if app.canStartAgents {
                    Button { focus.fixWithClaude(pr) } label: { Label("Fix with Claude", systemImage: "sparkle") }
                }
                Button { Task { await focus.rerunFailed(pr.prKey) } } label: { Label("Rerun failed checks", systemImage: "arrow.counterclockwise") }
            }
            if app.canStartAgents {
                Button { focus.openInT3(pr) } label: { Label("Open in T3…", systemImage: "apple.terminal") }
            }
        }
        Section {
            Button { Task { await focus.snoozeUntilTomorrow(pr.prKey) } } label: { Label("Snooze until tomorrow", systemImage: "moon") }
            ForEach(pr.workItemIds.prefix(2), id: \.self) { id in
                Button { app.openWorkItem(ItemRoute(id: id), from: pr.prKey) } label: { Label("Open AB#" + String(id), systemImage: "rectangle.split.3x1") }
            }
            Button { focus.copyBranch(pr) } label: { Label("Copy branch name", systemImage: "arrow.triangle.branch") }
            Button { focus.openOnGitHub(pr) } label: { Label("Open on GitHub", systemImage: "arrow.up.right.square") }
        }
    }
}

/// The line under the pull request list that explains the swipes, until the first swipe.
enum PrSwipeHint {
    static let key = "focus.swipeHintSeen"
    static let text = "Swipe left to merge or snooze until tomorrow. Swipe right to start a review. Touch and hold for everything else."
}

extension View {
    /// Swipe right to review; swipe left to snooze, or merge when it can be merged. A full swipe left opens the merge
    /// sheet, never a blind merge.
    func prSwipeActions(_ pr: PrSummary, app: AppModel) -> some View {
        self
            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                Button {
                    UserDefaults.standard.set(true, forKey: PrSwipeHint.key)
                    app.router.review([pr.prKey])
                } label: { Label(pr.isMine ? "Walk through" : "Review", systemImage: "eye") }
                    .tint(BD.accent)
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                if pr.canMerge {
                    Button {
                        UserDefaults.standard.set(true, forKey: PrSwipeHint.key)
                        app.router.present(.merge(pr.prKey))
                    } label: { Label("Merge", systemImage: "arrow.triangle.merge") }
                        .tint(BD.green)
                }
                Button {
                    UserDefaults.standard.set(true, forKey: PrSwipeHint.key)
                    Task { await app.focus.snoozeUntilTomorrow(pr.prKey) }
                } label: { Label("Snooze", systemImage: "moon") }
                    .tint(Color(hex: 0x8B8BF5))
            }
    }
}
