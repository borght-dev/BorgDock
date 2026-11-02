import SwiftUI

/// The home tab: the desktop's Focus board as one column. Bucket pills, a card per pull request with the reason it's
/// yours, and the agents waiting on you underneath.
struct FocusView: View {
    @Environment(AppModel.self) private var app
    @AppStorage("focus.hideDrafts") private var hideDrafts = false
    @AppStorage("focus.onlyMine") private var onlyMine = false
    @AppStorage(FocusView.swipeHintKey) private var swipeHintSeen = false

    static let swipeHintKey = "focus.swipeHintSeen"

    var body: some View {
        let store = app.focus
        List {
            if let focus = store.focus {
                pills(focus)
                let prs = visible(store.pullRequests(in: store.bucket))
                if prs.isEmpty {
                    emptyBucket
                } else {
                    ForEach(prs) { pr in
                        Button { app.router.push(.pullRequest(pr.prKey)) } label: { PrCard(pr: pr) }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("pr-card-\(pr.key)")
                            .contextMenu { PrContextMenu(pr: pr) } preview: { PrCard(pr: pr).frame(width: 370).environment(app) }
                            .prSwipeActions(pr, app: app)
                            .cardRow()
                    }
                    if !swipeHintSeen {
                        Text("Swipe left to merge or snooze until tomorrow. Swipe right to start a review. Touch and hold for everything else.")
                            .font(.system(size: 14))
                            .foregroundStyle(BD.text3)
                            .lineSpacing(2)
                            .padding(.horizontal, 16)
                            .cardRow(top: 10)
                    }
                }
                if store.bucket == .you, !focus.agentsWaiting.isEmpty {
                    agents(focus.agentsWaiting)
                }
            } else if let error = store.error {
                ContentUnavailableView {
                    Label("Can't load Focus", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await store.load(reportErrors: true) } }.buttonStyle(.bordered)
                }
                .cardRow()
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 80).cardRow()
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(BD.bg)
        .navigationTitle("Focus")
        .navigationSubtitle(store.focus.map { store.bucket.subtitle($0) } ?? "")
        .toolbar { toolbar }
        .refreshable { await store.load(reportErrors: true) }
        .overlay(alignment: .bottom) { ApprovalToast().padding(.bottom, 8) }
        .task {
            #if DEBUG
            DebugSigner.installIfSampleServer(app)
            Task { await I1DebugRoute.apply(app) }
            #endif
            await store.loadPreferences()
        }
        .task { await store.poll() }
    }

    /// "Koen van der Borght" → "Koen Borght", so avatars read KB.
    static func firstAndLast(_ name: String) -> String {
        let words = name.split(separator: " ")
        guard words.count > 2, let first = words.first, let last = words.last else { return name }
        return "\(first) \(last)"
    }

    /// First and last name: "Koen van der Borght" → "KB".
    static func initials(_ name: String) -> String {
        let words = name.split(separator: " ")
        guard let first = words.first?.first, words.count > 1, let last = words.last?.first else { return PersonAvatar.initials(name) }
        return String([first, last]).uppercased()
    }

    private func visible(_ prs: [PrSummary]) -> [PrSummary] {
        prs.filter { (!hideDrafts || !$0.isDraft) && (!onlyMine || $0.isMine) }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button { app.router.present(.settings) } label: {
                Text(FocusView.initials(app.config?.user.name ?? "Me"))
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
                Toggle("Hide drafts", systemImage: "doc.badge.ellipsis", isOn: $hideDrafts)
                Toggle("Only mine", systemImage: "person", isOn: $onlyMine)
                Divider()
                Button("Refresh", systemImage: "arrow.clockwise") { Task { await app.focus.load(reportErrors: true) } }
            } label: {
                Image(systemName: "slider.horizontal.3").foregroundStyle(BD.text)
            }
            .accessibilityLabel("Filter")
        }
    }

    private func pills(_ focus: Focus) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(FocusBucket.allCases, id: \.self) { bucket in
                    Button {
                        withAnimation(.snappy) { app.focus.bucket = bucket }
                    } label: {
                        BucketPill(title: bucket.title, count: focus.count(bucket), selected: app.focus.bucket == bucket)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(app.focus.bucket == bucket ? .isSelected : [])
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollClipDisabled()
        .listRowInsets(EdgeInsets(top: 2, leading: 0, bottom: 6, trailing: 0))
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
    }

    private var emptyBucket: some View {
        VStack(spacing: 8) {
            Image(systemName: "checkmark.circle").font(.system(size: 30)).foregroundStyle(BD.green)
            Text(app.focus.bucket == .you ? "Nothing needs you" : "Nothing here").font(.headline).foregroundStyle(BD.text)
            Text("Pull to refresh, or check the other buckets.").font(.subheadline).foregroundStyle(BD.text2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .cardRow()
    }

    private func agents(_ agents: [AgentWaiting]) -> some View {
        Section {
            VStack(spacing: 0) {
                ForEach(Array(agents.enumerated()), id: \.element.id) { index, agent in
                    Button { app.router.push(.thread(agent.threadId)) } label: { AgentWaitingRow(agent: agent) }
                        .buttonStyle(.plain)
                    if index < agents.count - 1 { Divider().overlay(BD.separator).padding(.leading, 64) }
                }
            }
            .bdCard()
            .cardRow()
        } header: {
            HStack {
                Text("Agents waiting on you")
                Spacer()
                Button("Dispatch") { app.router.tab = .dispatch }.foregroundStyle(BD.accentText)
            }
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(BD.text2)
            .textCase(nil)
            .padding(.horizontal, 8)
            .padding(.top, 2)
        }
        .listSectionSeparator(.hidden)
    }
}

struct AgentWaitingRow: View {
    let agent: AgentWaiting

    var body: some View {
        HStack(spacing: 12) {
            let color = agent.tone == .warn || agent.tone == .bad ? agent.tone.color : BD.accent
            Image(systemName: agent.tone == .warn ? "questionmark.bubble" : "cpu")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 36, height: 36)
                .background(color.opacity(0.14), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(agent.title).font(.system(size: 16, weight: .medium)).foregroundStyle(BD.text).lineLimit(1)
                Text(agent.detail).font(.system(size: 13.5)).foregroundStyle(BD.text2).lineLimit(1)
            }
            Spacer(minLength: 4)
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(BD.text3)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

extension View {
    /// A List row that draws its own card: no separator, no background, the card's own spacing.
    func cardRow(top: CGFloat = 6, bottom: CGFloat = 6) -> some View {
        listRowInsets(EdgeInsets(top: top, leading: 16, bottom: bottom, trailing: 16))
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }
}
