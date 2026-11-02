import AppIntents
import CoreSpotlight
import SwiftUI
import WidgetKit

/// What the app does for its extensions while it runs: refresh the widgets' snapshot when it comes forward, ask
/// for background refreshes when it leaves, register Live Activity tokens, index Spotlight, and open Spotlight
/// results. Applied once, on the root view.
struct ExtensionsGlue: ViewModifier {
    @Environment(AppModel.self) private var app
    @Environment(\.scenePhase) private var scenePhase

    func body(content: Content) -> some View {
        content
            .task {
                AgentStopper.handler = { threadId in try await LiveActivityController.stopAgent(threadId: threadId) }
                ApprovalUndoer.handler = { [app] holdId in app.focus.hold.undo(holdId: holdId) }
                LiveActivityController.observe()
                await DebugExtensions.apply(to: app)
            }
            .task(id: scenePhase) {
                switch scenePhase {
                case .active:
                    guard app.isSignedIn else { return }
                    await WidgetRefresher.refresh(api: app.api)
                    try? await Task.sleep(for: .seconds(4))
                    await SpotlightIndexer.refresh(app: app)
                case .background:
                    WidgetRefresher.scheduleBackgroundRefresh()
                default:
                    break
                }
            }
            .onContinueUserActivity(CSSearchableItemActionType) { activity in
                if let link = SpotlightIndexer.link(from: activity) { app.open(link) }
            }
            .onChange(of: shownRoute) { _, route in app.notes.remember(route: route) }
            #if DEBUG
            .overlay {
                if let kind = DebugExtensions.gallery { ExtensionGallery(kind: kind) }
            }
            #endif
    }

    /// The screen on top of the current tab, so a quick note links what you last opened.
    private var shownRoute: Route? {
        let router = app.router
        switch router.tab {
        case .focus: return router.focusPath.last
        case .pullRequests: return router.pullRequestsPath.last
        case .dispatch: return router.dispatchPath.last
        case .notes: return router.notesPath.last
        case .search: return router.searchPath.last
        }
    }
}

extension View {
    func borgDockExtensions() -> some View { modifier(ExtensionsGlue()) }
}

/// The Action button and Shortcuts: "Quick note" opens the capture sheet.
struct BorgDockShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: QuickNoteIntent(),
            phrases: ["Quick note in \(.applicationName)", "Write a \(.applicationName) note"],
            shortTitle: "Quick note",
            systemImageName: "square.and.pencil"
        )
    }
}

/// `-BorgDockLiveActivity agent|checks|both` starts sample Live Activities, `-BorgDockSnapshot sample` writes
/// the placeholder snapshot, `-BorgDockGallery` shows the extensions' views (DEBUG only, for screenshots).
@MainActor
enum DebugExtensions {
    /// `-BorgDockGallery widgets|lock|island|notification` (DEBUG only).
    static var gallery: String? {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-BorgDockGallery"), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
        #else
        nil
        #endif
    }

    static func apply(to app: AppModel) async {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        func value(_ flag: String) -> String? {
            guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
            return arguments[index + 1]
        }
        if value("-BorgDockSnapshot") == "sample", (try? WidgetSnapshotStore().save(.placeholder)) == true {
            WidgetCenter.shared.reloadAllTimelines()
        }
        guard let kind = value("-BorgDockLiveActivity") else { return }
        if kind == "agent" || kind == "both" {
            LiveActivityController.startAgent(
                threadId: "sample-60988", itemId: 60988, title: "Refund email sent twice", machine: "mac-mini",
                state: AgentActivityState(step: "Running the tests", stepIndex: 4, stepCount: 6, status: .running, startedAt: ISODates.format(.now.addingTimeInterval(-432)))
            )
        }
        if kind == "checks" || kind == "both" {
            LiveActivityController.startChecks(
                prKey: "shop/shop#3712", number: 3712, title: "Checkout: keep the basket",
                state: ChecksActivityState(passed: 15, failed: 1, pending: 2, total: 18)
            )
        }
        #endif
    }
}
