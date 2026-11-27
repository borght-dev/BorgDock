import SwiftUI

/// BorgDock Review: pull request review on its own. It reads GitHub and Azure DevOps straight from this iPhone, so
/// there is no server to sign in to, and no agents, notes or sprint: those stay in BorgDock.
@main
struct BorgDockReviewApp: App {
    @State private var model: AppModel

    init() {
        _model = State(initialValue: AppModel(direct: Self.session()))
    }

    /// The Keychain's accounts; a Debug build started with `-BorgDockFixture` reads made-up sample data instead.
    private static func session() -> DirectSession {
        #if DEBUG
        if DirectFixture.isOn { return DirectFixture.session() }
        #endif
        return DirectSession()
    }

    var body: some Scene {
        WindowGroup {
            ReviewRootView()
                .environment(model)
                .environment(\.imageLoader, model.direct?.imageLoader ?? ImageLoader())
                .tint(Palette.accent)
        }
    }
}

struct ReviewRootView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        ZStack {
            BD.bg.ignoresSafeArea()
            if let direct = app.direct {
                // The first run's steps stay up until the last one is done, though the first already signs you in.
                if app.isSignedIn, !direct.isSettingUp { ReviewHome() } else { SetupFlow(session: direct) }
            }
        }
        .overlay(alignment: .top) { ToastView() }
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
        #if DEBUG
        .task { if let direct = app.direct, !DirectFixture.isOn { await DirectDebugAccounts.connect(direct) } }
        #endif
    }
}

/// One stack: the pull request list and everything opened from it.
struct ReviewHome: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        @Bindable var router = app.router
        NavigationStack(path: $router.pullRequestsPath) {
            PullRequestsView()
                .routeDestinations()
        }
        .sheet(item: $router.sheet) { SheetHost(sheet: $0) }
        .fullScreenCover(item: $router.cover) { CoverHost(cover: $0) }
        .task { await app.focus.loadPreferences() }
        .task { await DebugRoute.apply(to: app) }
        #if DEBUG
        .task { await I1DebugRoute.apply(app) }
        #endif
    }
}
