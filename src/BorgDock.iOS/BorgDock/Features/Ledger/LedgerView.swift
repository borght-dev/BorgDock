import SwiftUI

/// BorgDock Review's first screen, the Ledger: everything that involves you on one list of two-line rows, in four
/// sections with a fixed order, and the rest of your repositories folded under them.
/// Design: design/review-app/mockups.html, "Overview: the Ledger".
struct LedgerView: View {
    @Environment(AppModel.self) private var app
    @AppStorage(LedgerFolds.key) private var folds = LedgerFolds()
    @State private var searching = false
    @State private var workItems = LedgerWorkItems()
    /// The repositories the phone watches, for the footer's count.
    @State private var watched: [String] = []
    /// Accounts the last read got nothing from: their pull requests are old or missing.
    @State private var accountTroubles: [AccountTrouble] = []
    #if DEBUG
    @State private var debugSearch: String?
    @State private var debugScrollToEnd = false
    #endif

    var body: some View {
        let store = app.focus
        ZStack {
            BD.bg.ignoresSafeArea()
            if searching, let focus = store.focus {
                LedgerSearchView(focus: focus, workItems: workItems, startText: startText) { withAnimation(.snappy) { searching = false } }
                    .transition(.opacity)
            } else {
                TimelineView(.periodic(from: .now, by: 30)) { timeline in
                    overview(store, now: timeline.date)
                }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .overlay(alignment: .bottom) { ApprovalToast().padding(.bottom, 8) }
        .task { await store.poll() }
        .task(id: workItemIds) { await workItems.load(workItemIds, from: app.direct) }
        .task(id: store.focus?.generatedAt) {
            if let read = try? await app.pullRequests.repositories() { watched = read.repositories.map(\.name) }
            accountTroubles = await app.direct?.gitHub.accountTroubles() ?? []
        }
        .onChange(of: app.direct?.hasAzureDevOps) { _, _ in workItems.forget() }
        #if DEBUG
        .task {
            guard let route = LedgerDebugRoute.request() else { return }
            if route.unfold { folds = LedgerFolds(rawValue: LedgerSection.allCases.map(\.rawValue).joined(separator: ",")) }
            if route.fold { folds = LedgerFolds() }
            debugScrollToEnd = route.end
            if route.refresh {
                for _ in 0..<40 where store.focus == nil { try? await Task.sleep(for: .milliseconds(250)) }
                if route.late { try? await Task.sleep(for: .seconds(6)) }
                await store.load(reportErrors: true, fresh: true)
            }
            if let search = route.search {
                for _ in 0..<40 where store.focus == nil { try? await Task.sleep(for: .milliseconds(250)) }
                debugSearch = search
                searching = true
            }
        }
        #endif
    }

    private var startText: String {
        #if DEBUG
        return debugSearch ?? ""
        #else
        return ""
        #endif
    }

    /// The first work item of every row: what the rows colour and the long press names.
    private var workItemIds: [Int] {
        var seen: Set<Int> = []
        return (app.focus.focus?.pullRequests ?? []).compactMap(\.workItemIds.first).filter { seen.insert($0).inserted }
    }

    private var accounts: [Person] { app.reviewAccounts }

    // MARK: - The list

    @ViewBuilder
    private func overview(_ store: FocusStore, now: Date) -> some View {
        let ledger = store.focus.map { Ledger($0.pullRequests, LedgerContext(focus: $0, app: app, now: now)) }
        let stale = store.trouble != nil
        ScrollViewReader { proxy in
        List {
            if let focus = store.focus, let ledger {
                if let trouble = store.trouble {
                    LedgerBanner(trouble: trouble, readAt: LedgerClock.time(focus.generatedAt)) { app.router.present(.settings) }
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 6, trailing: 16))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                } else {
                    // One account can't be read: the list says which, and keeps showing the rest.
                    ForEach(accountTroubles) { trouble in
                        LedgerBanner(account: trouble, known: app.direct?.credentials.gitHub.first { $0.id == trouble.id }) { app.router.present(.settings) }
                            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 6, trailing: 16))
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                    }
                }
                if ledger.involving == 0 {
                    allClear
                } else {
                    ForEach(LedgerSection.overview.filter(\.involvesYou), id: \.self) { section in
                        self.section(section, ledger, now: now, stale: stale)
                    }
                }
                section(.alsoOpen, ledger, now: now, stale: stale)
                footer(focus, ledger)
            } else if let error = store.error {
                ContentUnavailableView {
                    Label("Can't read your pull requests", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await store.load(reportErrors: true) } }.buttonStyle(.bordered)
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            } else {
                skeleton
            }
        }
        .ledgerList()
        .accessibilityIdentifier("ledger")
        .safeAreaInset(edge: .top, spacing: 0) { titleBar(store, ledger, now: now) }
        .refreshable { await store.load(reportErrors: true, fresh: true) }
        #if DEBUG
        .task(id: debugScrollToEnd) {
            guard debugScrollToEnd else { return }
            for _ in 0..<40 where store.focus == nil { try? await Task.sleep(for: .milliseconds(250)) }
            try? await Task.sleep(for: .milliseconds(400))
            proxy.scrollTo(Self.footerId, anchor: .bottom)
        }
        #endif
        }
    }

    private static let footerId = "ledger-footer"

    @ViewBuilder
    private func section(_ section: LedgerSection, _ ledger: Ledger, now: Date, stale: Bool) -> some View {
        let rows = ledger.rows(in: section)
        // An empty section is left out. To review stays and says so, so you can tell the list was read.
        if !rows.isEmpty || section == .toReview {
            let folded = folds.isFolded(section)
            Section {
                if !folded {
                    if section == .alsoOpen {
                        ForEach(ledger.repositories) { repository in
                            repositoryHeader(repository)
                            LedgerRows(rows: repository.rows, now: now, stale: stale, workItems: workItems)
                        }
                    } else if rows.isEmpty {
                        nothingToReview
                    } else {
                        LedgerRows(rows: rows, now: now, stale: stale, workItems: workItems)
                    }
                }
            } header: {
                LedgerSectionHeader(
                    title: section.title, count: rows.count,
                    folded: section.folds ? folded : nil,
                    toggle: { withAnimation(.snappy) { folds.toggle(section) } },
                    startReview: section == .toReview && !rows.isEmpty ? { app.router.review(ledger.reviewQueue) } : nil,
                    startDisabled: stale, identifier: "ledger-section-\(section.rawValue)"
                )
            }
        }
    }

    /// `acme/payments 5`, in the mono face, over that repository's rows.
    private func repositoryHeader(_ repository: Ledger.Repository) -> some View {
        HStack(spacing: 6) {
            Text(repository.name).lineLimit(1)
            Text(verbatim: "\(repository.rows.count)")
            Spacer(minLength: 0)
        }
        .font(.system(size: 11.5, weight: .medium, design: .monospaced))
        .foregroundStyle(BD.text3)
        .padding(EdgeInsets(top: 9, leading: 16, bottom: 5, trailing: 16))
        .listRowInsets(EdgeInsets())
        .listRowBackground(BD.card)
        .listRowSeparator(.hidden, edges: .bottom)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private var nothingToReview: some View {
        HStack(spacing: 9) {
            Image(systemName: "checkmark.circle").font(.system(size: 17)).foregroundStyle(BD.green)
            Text("Nothing waits for your review").font(.system(size: 14)).foregroundStyle(BD.text2)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 44)
        .listRowInsets(EdgeInsets())
        .listRowBackground(BD.card)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("ledger-nothing-to-review")
    }

    private var allClear: some View {
        VStack(spacing: 8) {
            Image(systemName: "checkmark")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(BD.green)
                .frame(width: 56, height: 56)
                .background(BD.greenSoft, in: Circle())
                .padding(.bottom, 8)
            Text("All clear").font(.system(size: 22, weight: .bold)).tracking(-0.4).foregroundStyle(BD.text)
            Text("No reviews asked and nothing of yours is open.")
                .font(.system(size: 15))
                .foregroundStyle(BD.text2)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 110)
        .padding(.bottom, 120)
        .padding(.horizontal, 24)
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("ledger-all-clear")
    }

    /// What was read and when: there is no push, so the list is as fresh as its last read.
    private func footer(_ focus: Focus, _ ledger: Ledger) -> some View {
        let repositories = Set(watched.map { $0.lowercased() }).union(focus.pullRequests.map { "\($0.owner)/\($0.repo)".lowercased() }).count
        let accounts = max(1, Set(focus.pullRequests.map(\.account)).union(self.accounts.map(\.login)).count)
        let what = "\(repositories == 1 ? "1 repository" : "\(repositories) repositories") on \(accounts == 1 ? "1 account" : "\(accounts) accounts")"
        return Text(verbatim: "\(what) · read at \(LedgerClock.time(focus.generatedAt))\nPull down to read again")
            .font(.system(size: 12))
            .lineSpacing(3)
            .foregroundStyle(BD.text3)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, 16)
            .padding(.bottom, 28)
            .padding(.horizontal, 20)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .id(Self.footerId)
            .accessibilityIdentifier("ledger-footer")
    }

    /// The first read: the sections with grey rows where the pull requests will be.
    @ViewBuilder
    private var skeleton: some View {
        Section {
            ForEach([176, 150, 190, 132, 164], id: \.self) { width in skeletonRow(CGFloat(width)) }
        } header: {
            LedgerSectionHeader(title: LedgerSection.toReview.title)
        }
        Section {
            ForEach([158, 184], id: \.self) { width in skeletonRow(CGFloat(width)) }
        } header: {
            LedgerSectionHeader(title: LedgerSection.needsYou.title)
        }
    }

    private func skeletonRow(_ width: CGFloat) -> some View {
        LedgerSkeletonRow(titleWidth: width)
            .listRowInsets(EdgeInsets())
            .listRowBackground(BD.card)
            .listRowSeparatorTint(BD.separator)
            .alignmentGuide(.listRowSeparatorLeading) { _ in 46 }
    }

    // MARK: - Title bar

    private func titleBar(_ store: FocusStore, _ ledger: Ledger?, now: Date) -> some View {
        HStack(spacing: 8) {
            BDAppTile(size: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text("Overview").font(.system(size: 16, weight: .semibold)).foregroundStyle(BD.text)
                Text(subtitle(store, ledger, now: now))
                    .font(.system(size: 12))
                    .foregroundStyle(BD.text2)
                    .lineLimit(1)
                    .accessibilityIdentifier("ledger-subtitle")
            }
            .padding(.leading, 3)
            Spacer(minLength: 8)
            Button { withAnimation(.snappy) { searching = true } } label: {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(BD.text)
                    .frame(width: 36, height: 36)
                    .background(BD.card, in: Circle())
                    .overlay(Circle().strokeBorder(BD.separator, lineWidth: 0.5))
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.trailing, -4)
            .disabled(store.focus == nil)
            .accessibilityLabel("Search")
            .accessibilityIdentifier("ledger-search")
            Button { app.router.present(.settings) } label: {
                Text(PersonAvatar.initials(accounts.first?.displayName ?? "Me"))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(LinearGradient(colors: [BD.brandIndigo, Color(hex: 0x4F46E5)], startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.trailing, -4)
            .accessibilityLabel("Settings")
            .accessibilityIdentifier("open-settings")
        }
        .padding(.horizontal, 16)
        .frame(height: 54)
        .background(LedgerList.barBackground)
    }

    private func subtitle(_ store: FocusStore, _ ledger: Ledger?, now: Date) -> String {
        guard let focus = store.focus, let ledger else { return store.error == nil ? "Reading your repositories…" : "Not read yet" }
        let count = ledger.involving
        let involve = count == 0 ? "Nothing involves you" : count == 1 ? "1 involves you" : "\(count) involve you"
        if store.trouble != nil { return "\(involve) · read at \(LedgerClock.time(focus.generatedAt))" }
        return "\(involve) · updated \(LedgerClock.ago(focus.generatedAt, now: now))"
    }
}

/// How the Ledger's lists sit under their bar: plain, full width, the first header right under the bar.
enum LedgerList {
    /// A pinned header sits a few points under the bar; the bar's background covers that, or rows show through.
    static let pinnedGap: CGFloat = 4

    static var barBackground: some View { BD.bg.padding(.bottom, -pinnedGap) }
}

extension View {
    func ledgerList() -> some View {
        listStyle(.plain)
            .listSectionSpacing(0)
            .environment(\.defaultMinListRowHeight, 1)
            // A plain list keeps 22 points free above its first header unless told otherwise.
            .contentMargins(.top, 0, for: .scrollContent)
            .scrollContentBackground(.hidden)
            .background(BD.bg)
    }
}

/// When the list was read, as the title bar and the footer say it.
enum LedgerClock {
    /// "09:39".
    static func time(_ iso: String) -> String {
        guard let date = GitHubTime.date(iso) else { return "" }
        return date.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
    }

    /// "just now", "2 min ago", "3 h ago".
    static func ago(_ iso: String, now: Date) -> String {
        guard let date = GitHubTime.date(iso) else { return "" }
        let minutes = Int(max(0, now.timeIntervalSince(date)) / 60)
        if minutes < 1 { return "just now" }
        if minutes < 60 { return "\(minutes) min ago" }
        return "\(minutes / 60) h ago"
    }
}

/// Over the list: why it is old (no connection, a token GitHub refuses, whatever else GitHub answered), or which
/// account isn't being read while the rest is.
struct LedgerBanner: View {
    let icon: String
    let lead: String
    let rest: String
    var action: String?
    let perform: () -> Void

    init(trouble: ListTrouble, readAt: String, openSettings: @escaping () -> Void) {
        switch trouble.kind {
        case .offline:
            (icon, lead, action) = ("exclamationmark.triangle", "No connection.", nil)
            rest = "This is the list from \(readAt). Reviewing and merging need GitHub, so they wait."
        case .token:
            (icon, lead, action) = ("key.horizontal", "GitHub refused a token.", "Replace the token")
            rest = "\(trouble.message) This is the list from \(readAt)."
        case .other:
            (icon, lead, action) = ("exclamationmark.triangle", "GitHub didn't answer.", nil)
            rest = "\(trouble.message) This is the list from \(readAt)."
        }
        perform = openSettings
    }

    /// "kv-labs isn't being read. Its token expired yesterday, so pull requests from your personal account are missing here."
    init(account trouble: AccountTrouble, known: DirectCredentials.GitHub?, openSettings: @escaping () -> Void) {
        lead = "\(trouble.login) isn't being read."
        perform = openSettings
        guard trouble.tokenRefused else {
            (icon, action) = ("exclamationmark.triangle", nil)
            rest = "\(trouble.message) Its pull requests here are from the last read that worked."
            return
        }
        (icon, action) = ("key.horizontal", "Replace the token")
        let label = known?.label.flatMap { $0.isEmpty ? nil : $0.lowercased() }
        let whose = label.map { "your \($0) account" } ?? "that account"
        let why: String = switch known?.daysLeft() {
        case let days? where days < 0: days == -1 ? "Its token expired yesterday" : "Its token expired \(-days) days ago"
        default: "GitHub refuses its token"
        }
        rest = "\(why), so pull requests from \(whose) are missing here."
    }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(BD.yellow)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 6) {
                Text("\(Text(lead).fontWeight(.semibold).foregroundStyle(BD.text)) \(rest)")
                    .font(.system(size: 13))
                    .foregroundStyle(BD.text2)
                    .fixedSize(horizontal: false, vertical: true)
                if let action {
                    Button(action, action: perform)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(BD.accentText)
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("ledger-banner-action")
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(BD.yellowSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ledger-banner")
    }
}

#if DEBUG
/// `-BorgDockRoute ledger/<open|fold>[/end]` unfolds or folds every section and can scroll to the end;
/// `ledger/search/<words>` opens search on those words; `ledger/refresh` reads the list again once it is there, as a
/// pull down does (with the fixture's `offline` mode that read fails).
enum LedgerDebugRoute {
    struct Request {
        var unfold = false
        var fold = false
        var end = false
        var refresh = false
        var late = false
        var search: String?
    }

    @MainActor
    static func request() -> Request? {
        guard let route = LaunchOverrides.route, route.hasPrefix("ledger/") else { return nil }
        let parts = route.dropFirst(7).split(separator: "/", maxSplits: 1).map(String.init)
        switch parts.first {
        case "open": return Request(unfold: true, end: parts.last == "end")
        case "fold": return Request(fold: true, end: parts.last == "end")
        case "refresh": return Request(fold: true, refresh: true, late: parts.last == "late")
        case "search": return Request(search: parts.count > 1 ? parts[1].removingPercentEncoding ?? "" : "")
        default: return nil
        }
    }
}
#endif
