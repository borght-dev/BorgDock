import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        ZStack {
            BD.bg.ignoresSafeArea()
            if app.isSignedIn {
                MainTabView()
            } else {
                SignInView()
            }
        }
        .overlay(alignment: .top) { ToastView() }
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
        .onOpenURL { url in app.open(url) }
        .borgDockExtensions()
    }
}

/// Four tabs and Search (Activity sits behind the bell on Focus), iOS 26 style: the tab bar floats in glass and folds into a search field on the Search tab.
struct MainTabView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var router = app.router
        TabView(selection: $router.tab) {
            Tab("Focus", systemImage: "scope", value: Router.Tab.focus) {
                NavigationStack(path: $router.focusPath) { FocusView().routeDestinations() }
            }
            Tab("Pull requests", systemImage: "arrow.triangle.pull", value: Router.Tab.pullRequests) {
                NavigationStack(path: $router.pullRequestsPath) { PullRequestsView().routeDestinations() }
            }
            Tab("Dispatch", systemImage: "cpu", value: Router.Tab.dispatch) {
                NavigationStack(path: $router.dispatchPath) { OverviewView().routeDestinations() }
            }
            .badge(app.dispatchBadge)
            Tab("Notes", systemImage: "note.text", value: Router.Tab.notes) {
                NavigationStack(path: $router.notesPath) { NotesView().routeDestinations() }
            }
            Tab(value: Router.Tab.search, role: .search) {
                NavigationStack(path: $router.searchPath) { SearchView().routeDestinations() }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .sheet(item: $router.sheet) { SheetHost(sheet: $0) }
        .fullScreenCover(item: $router.cover) { CoverHost(cover: $0) }
        .task { await app.bootstrap() }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await app.pollOverview()
        }
        .task { await DebugRoute.apply(to: app) }
    }
}

extension View {
    /// Every navigation stack can show every route.
    func routeDestinations() -> some View {
        navigationDestination(for: Route.self) { RouteView(route: $0) }
    }
}

struct RouteView: View {
    let route: Route

    var body: some View {
        switch route {
        case .pullRequest(let key): PullRequestView(key: key)
        case .workItem(let item): ItemDetailView(route: item)
        case .thread(let id): ThreadView(id: id)
        case .ciGroup(let id): CiGroupView(id: id)
        case .workstream(let id): WorkstreamView(id: id)
        case .note(let path): NoteView(path: path)
        case .browse: BrowseView()
        case .activity: ActivityView()
        case .settings: SettingsView()
        case .machines: MachinesView()
        }
    }
}

struct SheetHost: View {
    @Environment(AppModel.self) private var app
    let sheet: SheetRoute

    var body: some View {
        switch sheet {
        case .start(let context):
            StartThreadSheet(context: context, config: app.config, worktrees: app.overview?.worktrees ?? [])
        case .launch(let context): LaunchSheet(context: context)
        case .merge(let key): MergeSheet(key: key)
        case .checks(let key): ChecksSheet(key: key)
        case .quickCapture: QuickCaptureSheet()
        case .addMachine: AddMachineView()
        case .linkDesktop: LinkDesktopView()
        case .settings: NavigationStack { SettingsView().routeDestinations() }
        }
    }
}

struct CoverHost: View {
    let cover: CoverRoute

    var body: some View {
        switch cover {
        case .review(let keys): QuickReviewView(keys: keys)
        }
    }
}

/// `-BorgDockRoute item/59657 | start/59463 | start/59463/qa | tab/<focus|prs|dispatch|activity|notes|search> | sheet/<settings|capture|machine|desktop> | url/<borgdock url> | scroll/<bay>` (DEBUG only).
enum DebugRoute {
    @MainActor
    static func apply(to app: AppModel) async {
        #if DEBUG
        guard let route = LaunchOverrides.route else { return }
        let parts = route.split(separator: "/", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return }
        switch parts[0] {
        case "item":
            if let id = Int(parts[1]) { app.router.openItem(id) }
        case "start":
            for _ in 0..<40 where app.overview == nil {
                try? await Task.sleep(for: .milliseconds(250))
            }
            let target = parts[1].split(separator: "/").map(String.init)
            if let id = Int(target[0]), let entry = app.itemOverview(id) {
                for _ in 0..<40 where app.config == nil { try? await Task.sleep(for: .milliseconds(250)) }
                app.router.start(entry.item, fromBrowse: false, mode: target.count > 1 ? StartMode(rawValue: target[1]) ?? .plan : .plan)
            }
        case "tab" where parts[1] == "activity":
            app.router.openActivity()
        case "tab":
            app.router.tab = switch parts[1] {
            case "prs": .pullRequests
            case "dispatch": .dispatch
            case "notes": .notes
            case "search": .search
            default: .focus
            }
        case "sheet":
            switch parts[1] {
            case "settings": app.router.present(.settings)
            case "capture": app.router.present(.quickCapture)
            case "machine": app.router.present(.addMachine)
            case "desktop": app.router.present(.linkDesktop)
            default: break
            }
        case "url":
            if let url = URL(string: parts[1]) { app.open(url) }
        case "scroll":
            app.router.tab = .dispatch
            app.router.scrollTarget = parts[1]
        default:
            break
        }
        #endif
    }
}
