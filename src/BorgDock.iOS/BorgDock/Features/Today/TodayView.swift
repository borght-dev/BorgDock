import SwiftUI

/// The home tab: the sprint at a glance, four counts and the things that wait on you, ranked ("Up next").
/// Mockup: the "Today — B" artboard of the iOS work-at-a-glance canvas.
struct TodayView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let focus = app.focus.focus
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                SprintTile().padding(.horizontal, 16)
                if focus == nil, let error = app.focus.error {
                    StatusCard(icon: "wifi.exclamationmark", text: "Can't load pull requests: \(error)", tone: .warn).padding(.top, -12)
                }
                tiles(focus).padding(.horizontal, 16)
                upNext(focus)
            }
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .background(BD.bg)
        .navigationTitle("Today")
        .navigationSubtitle(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)))
        .toolbar { toolbar }
        .refreshable {
            async let pullRequests: Void = app.focus.load(reportErrors: true)
            async let sprint: Void = app.sprint.load(reportErrors: true)
            async let items: Void = app.refreshOverview()
            _ = await (pullRequests, sprint, items)
        }
        .overlay(alignment: .bottom) { ApprovalToast().padding(.bottom, 8) }
        .task {
            #if DEBUG
            DebugSigner.installIfSampleServer(app)
            Task { await I1DebugRoute.apply(app) }
            #endif
            await app.focus.loadPreferences()
        }
        .task { await app.focus.poll() }
        .task { await app.sprint.poll() }
    }

    // MARK: - Counts

    private func tiles(_ focus: Focus?) -> some View {
        let needYou = focus?.pullRequests.filter { $0.bucket == .you } ?? []
        let waiting = focus?.pullRequests.filter { $0.bucket == .wait } ?? []
        let ready = focus?.count(.ready)
        let items = app.overview?.items ?? []
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible())], spacing: 10) {
            CountTile(title: "Need you", systemImage: "arrow.triangle.pull", iconColor: BD.red, value: focus.map { _ in "\(needYou.count)" },
                      valueColor: needYou.isEmpty ? BD.text : BD.red, detail: needYouDetail(needYou)) {
                app.router.tab = .pullRequests
            }
            .accessibilityIdentifier("today-need-you")
            CountTile(title: "Ready to merge", systemImage: "arrow.triangle.merge", iconColor: BD.green, value: ready.map(String.init),
                      valueColor: (ready ?? 0) > 0 ? BD.green : BD.text, detail: (ready ?? 0) > 0 ? "approved, checks pass" : "nothing yet") {
                app.router.tab = .pullRequests
            }
            CountTile(title: "My work", systemImage: "list.bullet", iconColor: BD.accent, value: app.overview.map { _ in "\(items.count)" },
                      valueSuffix: "open", detail: workDetail(items), detailTone: app.dispatchBadge > 0 ? .warn : nil) {
                app.router.tab = .work
            }
            CountTile(title: "Waiting on others", systemImage: "clock", iconColor: BD.text2, value: focus.map { _ in "\(waiting.count)" },
                      detail: oldest(waiting).map { "oldest \($0)" } ?? "nothing waiting") {
                app.router.tab = .pullRequests
            }
        }
    }

    private func needYouDetail(_ prs: [PrSummary]) -> String {
        let reviews = prs.filter { !$0.isMine }.count
        let yours = prs.count - reviews
        let parts = [reviews > 0 ? (reviews == 1 ? "1 review" : "\(reviews) reviews") : nil, yours > 0 ? "\(yours) yours" : nil].compactMap(\.self)
        return parts.isEmpty ? "nothing waiting" : parts.joined(separator: " · ")
    }

    private func workDetail(_ items: [ItemOverview]) -> String {
        let needYou = app.dispatchBadge
        if needYou > 0 { return needYou == 1 ? "1 needs you" : "\(needYou) need you" }
        let running = items.filter { $0.threads.contains { $0.status == .running } }.count
        if running > 0 { return running == 1 ? "1 agent running" : "\(running) agents running" }
        return "nothing waiting"
    }

    private func oldest(_ prs: [PrSummary]) -> String? {
        let created = { (pr: PrSummary) in ISODate.parse(pr.createdAt) ?? .distantFuture }
        return prs.min { created($0) < created($1) }.map { ShortTime.age($0.createdAt) }
    }

    // MARK: - Up next

    @ViewBuilder
    private func upNext(_ focus: Focus?) -> some View {
        let entries = UpNext.entries(focus: focus, overview: app.overview)
        HStack(alignment: .firstTextBaseline) {
            Text("Up next").font(.system(size: 21, weight: .bold)).foregroundStyle(BD.text)
            Spacer()
            if !entries.isEmpty { Text("ranked for you").font(.system(size: 14)).foregroundStyle(BD.text2) }
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        if entries.isEmpty {
            if focus != nil {
                StatusCard(icon: "checkmark.circle", text: "Nothing waits on you. Pull to refresh, or look at the sprint.", tone: .ok).padding(.top, -12)
            }
        } else {
            CellGroup(indent: 60) {
                ForEach(entries) { entry in
                    row(entry)
                }
            }
        }
    }

    @ViewBuilder
    private func row(_ entry: UpNextEntry) -> some View {
        let row = UpNextRow(entry: entry, open: { open(entry.target) }, shortcut: { run($0, entry.target) })
            .accessibilityIdentifier("up-next-\(entry.id)")
        if case .pullRequest(let pr) = entry.target {
            row.contextMenu { PrContextMenu(pr: pr) }
        } else {
            row
        }
    }

    private func open(_ target: UpNextEntry.Target) {
        switch target {
        case .pullRequest(let pr): app.router.push(.pullRequest(pr.prKey))
        case .thread(let id): app.router.push(.thread(id))
        }
    }

    private func run(_ shortcut: UpNextEntry.Shortcut, _ target: UpNextEntry.Target) {
        guard case .pullRequest(let pr) = target else { return }
        switch shortcut {
        case .review: app.router.review([pr.prKey])
        case .merge: app.router.present(.merge(pr.prKey))
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button { app.router.present(.settings) } label: {
                Text(PersonNames.initials(app.config?.user.name ?? "Me"))
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(LinearGradient(colors: [BD.accent, Color(hex: 0x4338CA)], startPoint: .top, endPoint: .bottom), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Settings")
        }
        .sharedBackgroundVisibility(.hidden)
        ToolbarItem(placement: .topBarTrailing) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                HStack(spacing: 7) {
                    if app.focus.isLoading {
                        ProgressView().controlSize(.mini)
                    } else {
                        PulseDot(color: app.focus.error == nil ? BD.green : BD.red, size: 7)
                    }
                    Text(ShortTime.since(app.focus.syncedAt, now: context.date)).monospacedDigit()
                }
                .font(.system(size: 15, weight: .semibold))
                .fixedSize()
                .padding(.horizontal, 6)
            }
            .accessibilityLabel("Last synced")
        }
        ToolbarSpacer(.fixed, placement: .topBarTrailing)
        ToolbarItem(placement: .topBarTrailing) {
            Button { app.router.push(.activity) } label: {
                if app.activity.unread > 0 {
                    Image(systemName: "bell.badge").symbolRenderingMode(.palette).foregroundStyle(BD.red, BD.text)
                } else {
                    Image(systemName: "bell").foregroundStyle(BD.text)
                }
            }
            .accessibilityLabel(app.activity.unread > 0 ? "Activity, \(app.activity.unread) new" : "Activity")
            .accessibilityIdentifier("open-activity")
        }
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button("Quick note", systemImage: "square.and.pencil") { app.router.present(.quickCapture) }
                Button("All notes", systemImage: "note.text") { app.router.push(.notes) }
            } label: {
                Image(systemName: "square.and.pencil").foregroundStyle(BD.text)
            } primaryAction: {
                app.router.present(.quickCapture)
            }
            .accessibilityLabel("Notes")
            .accessibilityHint("Writes a quick note. Touch and hold for all notes.")
            .accessibilityIdentifier("open-notes")
        }
    }
}

/// A count with what it means underneath: "Need you 3, 1 review · 2 yours".
private struct CountTile: View {
    let title: String
    let systemImage: String
    let iconColor: Color
    /// Nil while loading.
    let value: String?
    var valueColor: Color = BD.text
    var valueSuffix: String?
    let detail: String
    var detailTone: Tone?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 3) {
                Label {
                    Text(title).lineLimit(1)
                } icon: {
                    Image(systemName: systemImage).foregroundStyle(iconColor)
                }
                .font(.system(size: 13.5, weight: .semibold))
                .foregroundStyle(BD.text2)
                .labelStyle(TightLabelStyle(spacing: 6))
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text(value ?? "–").font(.system(size: 32, weight: .bold)).foregroundStyle(valueColor).monospacedDigit()
                    if let valueSuffix { Text(valueSuffix).font(.system(size: 17, weight: .semibold)).foregroundStyle(BD.text2) }
                }
                Text(value == nil ? " " : detail)
                    .font(.system(size: 13.5, weight: detailTone == nil ? .regular : .semibold))
                    .foregroundStyle(detailTone?.color ?? BD.text2)
                    .lineLimit(1)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .frame(maxWidth: .infinity, minHeight: 104, alignment: .leading)
            .bdCard(radius: 22)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}

/// The sprint in one card: percent done, the burndown and how the pace looks. Opens the Sprint tab.
private struct SprintTile: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let store = app.sprint
        let stats = store.stats(.team)
        Button { app.router.tab = .sprint } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "chart.line.downtrend.xyaxis").foregroundStyle(BD.accent)
                    Text(header(store.sprint, stats)).lineLimit(1)
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(BD.text3)
                }
                .font(.system(size: 13.5, weight: .semibold))
                .foregroundStyle(BD.text2)
                if let stats {
                    HStack(alignment: .bottom, spacing: 12) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("\(stats.percentDone)%").font(.system(size: 34, weight: .bold)).foregroundStyle(BD.text).monospacedDigit()
                            Text("done · \(stats.remaining) to go").font(.system(size: 13.5)).foregroundStyle(BD.text2)
                        }
                        Spacer(minLength: 0)
                        if let workingDays = stats.workingDays, workingDays > 0, let start = stats.burndown.first?.remaining {
                            BurndownChart(stats: stats, workingDays: workingDays, start: start, showsAxis: false)
                                .frame(width: 160, height: 66)
                        }
                    }
                    HStack(spacing: 8) {
                        if let pace = SprintDisplay.pace(stats) { ToneChip(text: pace.text, tone: pace.tone, small: true) }
                        Text(footer(stats)).font(.system(size: 13.5)).foregroundStyle(BD.text2).lineLimit(1)
                    }
                } else if let error = store.error {
                    Text(error).font(.system(size: 14)).foregroundStyle(BD.text2).lineLimit(2)
                } else {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 80)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .bdCard(radius: 22)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("today-sprint")
    }

    private func header(_ sprint: Sprint?, _ stats: SprintStats?) -> String {
        guard let sprint else { return "Sprint" }
        guard let stats, let today = stats.today, let days = stats.workingDays, today > 0 else { return "Sprint \(sprint.name)" }
        return "Sprint \(sprint.name) · day \(today) of \(days)"
    }

    private func footer(_ stats: SprintStats) -> String {
        var parts: [String] = []
        if let left = stats.daysLeft { parts.append(left == 0 ? "last day" : left == 1 ? "1 day left" : "\(left) days left") }
        if let forecast = stats.forecastLeft, forecast > 0 { parts.append("~\(forecast) may carry over") }
        return parts.joined(separator: " · ")
    }
}

/// A row of Up next: what to do, what it is about, and a one-tap Review or Merge where that is the whole job.
private struct UpNextRow: View {
    let entry: UpNextEntry
    let open: () -> Void
    let shortcut: (UpNextEntry.Shortcut) -> Void

    private var color: Color { entry.accent ? BD.accentText : entry.tone.color }
    private var soft: Color { entry.accent ? BD.accentSoft : entry.tone.soft }

    var body: some View {
        HStack(spacing: 10) {
            Button(action: open) {
                HStack(spacing: 12) {
                    Image(systemName: entry.systemImage)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(color)
                        .frame(width: 34, height: 34)
                        .background(soft, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.title).font(.system(size: 15.5, weight: .semibold)).foregroundStyle(BD.text).lineLimit(1)
                        Text("\(Text(entry.verb).fontWeight(.semibold).foregroundStyle(color)) · \(entry.detail)")
                            .font(.system(size: 13.5))
                            .foregroundStyle(BD.text2)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    if entry.shortcut == nil {
                        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(BD.text3)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if let action = entry.shortcut {
                Button(action == .review ? "Review" : "Merge") { shortcut(action) }
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(action == .review ? BD.onAccent : BD.onGreen)
                    .padding(.horizontal, 14)
                    .frame(height: 34)
                    .background(action == .review ? BD.accent : BD.green, in: Capsule())
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("up-next-\(action == .review ? "review" : "merge")-\(entry.id)")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
    }
}
