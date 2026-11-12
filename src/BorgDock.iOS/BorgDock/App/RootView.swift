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

/// Four tabs and Search (Activity sits behind the bell on Focus, Notes behind its notes button), iOS 26 style: the tab
/// bar floats in glass and folds into a search field on the Search tab.
struct MainTabView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var router = app.router
        TabView(selection: $router.tab) {
            Tab("Focus", systemImage: "scope", value: Router.Tab.today) {
                NavigationStack(path: $router.todayPath) { FocusView().routeDestinations() }
            }
            Tab("Pull requests", systemImage: "arrow.triangle.pull", value: Router.Tab.pullRequests) {
                NavigationStack(path: $router.pullRequestsPath) { PullRequestsView().routeDestinations() }
            }
            .badge(app.focus.focus?.count(.you) ?? 0)
            Tab("Work", systemImage: "list.bullet", value: Router.Tab.work) {
                NavigationStack(path: $router.workPath) { OverviewView().routeDestinations() }
            }
            .badge(app.dispatchBadge)
            Tab("Sprint", systemImage: "chart.line.downtrend.xyaxis", value: Router.Tab.sprint) {
                NavigationStack(path: $router.sprintPath) { SprintView().routeDestinations() }
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
        case .ciGroup(let id): CiGroupView(id: id)
        case .workstream(let id): WorkstreamView(id: id)
        case .note(let path): NoteView(path: path)
        case .activity: ActivityView()
        case .settings: SettingsView()
        case .machines: MachinesView()
        case .notes: NotesView()
        case .sprintItems(let list): SprintItemsView(list: list)
        case .repositories: RepositoriesView()
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

/// `-BorgDockRoute item/59657 | item/59657/<details|activity|…> | start/59463 | start/59463/qa | tab/<today|prs|work|sprint|activity|notes|search> | sheet/<settings|capture|machine|desktop> | url/<borgdock url> | scroll/<lane|show> | focus/ready | prs/<display|repositories|open/<group id>>` (DEBUG only).
enum DebugRoute {
    @MainActor
    static func apply(to app: AppModel) async {
        #if DEBUG
        guard let route = LaunchOverrides.route else { return }
        let parts = route.split(separator: "/", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return }
        switch parts[0] {
        case "item":
            let target = parts[1].split(separator: "/").map(String.init)
            if let id = Int(target[0]) {
                app.router.openItem(id)
                app.router.scrollTarget = target.dropFirst().first
            }
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
        case "tab" where parts[1] == "notes":
            app.router.open(.notes, in: .today)
        case "tab":
            app.router.tab = Router.Tab(link: parts[1]) ?? .today
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
            app.router.tab = .work
            app.router.scrollTarget = parts[1]
        case "focus":
            for _ in 0..<40 where app.focus.focus == nil { try? await Task.sleep(for: .milliseconds(250)) }
            try? await Task.sleep(for: .milliseconds(500))
            app.router.scrollTarget = parts[1]
        case "prs":
            await PrListDebugRoute.apply(parts[1], to: app)
        default:
            break
        }
        #endif
    }
}
