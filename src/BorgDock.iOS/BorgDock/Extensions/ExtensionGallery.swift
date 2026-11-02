#if DEBUG
import SwiftUI

/// `-BorgDockGallery widgets|lock|island|approval|notification`: the extensions' own views (ios/Shared/WidgetViews and
/// Notifications) on a wallpaper, laid out like the system shows them, for screenshots. The simulator can't add
/// widgets to the home screen or expand a Live Activity from a script; the views are the same ones the
/// extensions render.
struct ExtensionGallery: View {
    let kind: String

    private let snapshot = WidgetSnapshot.placeholder
    private let agent = AgentActivityAttributes(threadId: "sample-60988", itemId: 60988, title: "Refund email sent twice", machine: "mac-mini")
    private let agentState = AgentActivityState(step: "Running the tests", stepIndex: 4, stepCount: 6, status: .running, startedAt: ISODates.format(.now.addingTimeInterval(-432)))
    private let checks = ChecksActivityAttributes(prKey: "shop/shop#3712", number: 3712, title: "Checkout: keep the basket")
    private let checksState = ChecksActivityState(passed: 15, failed: 1, pending: 2, total: 18)
    private let approval = ApprovalActivityAttributes(holdId: "sample-hold", prKey: "acme/shop#3712", number: 3712, title: "Checkout: keep the basket on a payment timeout")
    /// Frozen two seconds into the five, so the clock reads "0:03" in every shot.
    private let approvalPause = Date.now
    private var approvalState: ApprovalActivityState {
        ApprovalActivityState(phase: .holding, startedAt: approvalPause.addingTimeInterval(-2), postsAt: approvalPause.addingTimeInterval(3))
    }

    var body: some View {
        ZStack(alignment: .top) {
            Wallpaper()
            switch kind {
            case "lock": lockScreen
            case "island": island
            case "approval": approvalIsland
            case "notification": notification
            default: homeScreen
            }
        }
        .ignoresSafeArea()
    }

    // MARK: Home screen

    private var homeScreen: some View {
        VStack(spacing: 22) {
            WidgetFrame(width: 364, height: 170) { FocusWidgetView(snapshot: snapshot) }
            HStack(spacing: 22) {
                WidgetFrame(width: 171, height: 171) { AgentsWidgetView(agents: snapshot.agents) }
                WidgetFrame(width: 171, height: 171, tint: snapshot.master.state == .failing ? BD.redSoft : nil) {
                    MasterWidgetView(master: snapshot.master, now: .now)
                }
            }
        }
        .padding(.top, 74)
    }

    // MARK: Lock screen

    private var lockScreen: some View {
        VStack(spacing: 0) {
            Image(systemName: "lock.fill").font(.system(size: 20)).foregroundStyle(.white.opacity(0.9)).padding(.top, 70)
            Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(.white.opacity(0.9))
                .padding(.top, 8)
            Text("21:05")
                .font(.system(size: 104, weight: .bold, design: .rounded))
                .foregroundStyle(.white.opacity(0.92))
            HStack(spacing: 12) {
                NeedYouAccessoryView(focus: snapshot.focus)
                    .frame(width: 72, height: 72)
                AgentsAccessoryView(agents: snapshot.agents)
                    .frame(width: 160, height: 72)
                    .padding(.horizontal, 10)
                    .background(.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                MasterAccessoryView(master: snapshot.master)
                    .frame(width: 72, height: 72)
                    .background(.white.opacity(0.14), in: Circle())
            }
            .foregroundStyle(.white)
            .environment(\.colorScheme, .dark)
            Spacer()
            VStack(spacing: 10) {
                AgentLockScreenView(attributes: agent, state: agentState)
                    .padding(16)
                    .background(BD.card.opacity(0.92), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                ChecksLockScreenView(attributes: checks, state: checksState)
                    .padding(16)
                    .background(BD.card.opacity(0.92), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 120)
        }
    }

    // MARK: Dynamic Island

    private var island: some View {
        VStack(spacing: 34) {
            // Compact.
            HStack {
                BDMark().fill(BD.brandIndigo).frame(width: 18, height: 18)
                Spacer()
                AgentTimer(state: agentState, size: 15)
            }
            .padding(.horizontal, 16)
            .frame(width: 250, height: 37)
            .background(.black, in: Capsule())
            .padding(.top, 120)
            // Expanded.
            VStack(spacing: 0) {
                HStack(alignment: .top, spacing: 10) {
                    BDAppTile(size: 46)
                    IslandTitle(context: agent.context, title: agent.title)
                    AgentTimer(state: agentState, size: 20).padding(.top, 14)
                }
                AgentIslandBottom(threadId: agent.threadId, state: agentState).padding(.top, 8)
            }
            .padding(18)
            .frame(width: 380)
            .background(.black, in: RoundedRectangle(cornerRadius: 44, style: .continuous))
            // Two at once: checks compact beside the agent, minimal.
            HStack(spacing: 8) {
                HStack {
                    ChecksRing(state: checksState, size: 20, lineWidth: 3)
                    Spacer()
                    ChecksCount(state: checksState)
                }
                .padding(.horizontal, 14)
                .frame(width: 210, height: 37)
                .background(.black, in: Capsule())
                BDMark().fill(BD.brandIndigo).frame(width: 16, height: 16)
                    .frame(width: 37, height: 37)
                    .background(.black, in: Circle())
            }
        }
        .environment(\.colorScheme, .dark)
    }

    // MARK: Approval

    private var approvalIsland: some View {
        VStack(spacing: 30) {
            // Compact.
            HStack {
                ApprovalCompactLeading(state: approvalState)
                Spacer()
                ApprovalCompactTrailing(attributes: approval, state: approvalState)
            }
            .padding(.horizontal, 14)
            .frame(width: 330, height: 37)
            .background(.black, in: Capsule())
            .padding(.top, 120)
            // Expanded.
            VStack(spacing: 0) {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(Color(hex: 0x5CC98F))
                        .frame(width: 40, height: 40)
                        .background(Color(hex: 0x5CC98F).opacity(0.18), in: Circle())
                    ApprovalIslandTitle(attributes: approval, state: approvalState)
                    ApprovalCountdown(state: approvalState, pauseAt: approvalPause, size: 20)
                        .foregroundStyle(.white)
                        .padding(.top, 8)
                }
                ApprovalIslandBottom(attributes: approval, state: approvalState, pauseAt: approvalPause).padding(.top, 8)
            }
            .padding(18)
            .frame(width: 380)
            .background(.black, in: RoundedRectangle(cornerRadius: 44, style: .continuous))
            .environment(\.colorScheme, .dark)
            // Minimal, beside an agent's compact activity.
            HStack(spacing: 8) {
                HStack {
                    BDMark().fill(BD.brandIndigo).frame(width: 18, height: 18)
                    Spacer()
                    AgentTimer(state: agentState, size: 15)
                }
                .padding(.horizontal, 16)
                .frame(width: 210, height: 37)
                .background(.black, in: Capsule())
                ApprovalMinimal(state: approvalState, pauseAt: approvalPause)
                    .frame(width: 24, height: 24)
                    .frame(width: 37, height: 37)
                    .background(.black, in: Circle())
            }
            .environment(\.colorScheme, .dark)
            Spacer()
            // Lock screen.
            ApprovalLockScreenView(attributes: approval, state: approvalState, pauseAt: approvalPause)
                .padding(16)
                .background(BD.card.opacity(0.92), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                .padding(.horizontal, 12)
                .padding(.bottom, 120)
        }
    }

    // MARK: Notification

    private var notification: some View {
        let model = QuestionCardModel()
        model.card = NotificationQuestion.sample
        model.selection = 0
        return VStack(spacing: 10) {
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    BDAppTile(size: 30)
                    Text("BorgDock · Agent question").font(.system(size: 16, weight: .semibold)).foregroundStyle(BD.text)
                    Spacer()
                    Text("2m").font(.system(size: 14)).foregroundStyle(BD.text2)
                }
                .padding(14)
                Divider()
                QuestionCardView(model: model)
            }
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
            VStack(spacing: 0) {
                ForEach(Array(Self.actions.enumerated()), id: \.offset) { index, action in
                    if index > 0 { Divider() }
                    HStack {
                        Text(action.title).font(.system(size: 17))
                        Spacer()
                        Image(systemName: action.icon)
                    }
                    .foregroundStyle(BD.text)
                    .padding(.horizontal, 18)
                    .frame(height: 50)
                }
            }
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .padding(.horizontal, 12)
        .padding(.top, 90)
    }
}

extension ExtensionGallery {
    /// The actions the content extension sets for the preselected option.
    static let actions: [(title: String, icon: String)] = [
        ("Answer: IndexedDB", "checkmark"), ("Reply…", "bubble.left"), ("Open the thread", "arrow.up.forward.square"),
    ]
}

/// A widget's rounded container with the system's content margins.
private struct WidgetFrame<Content: View>: View {
    let width: CGFloat
    let height: CGFloat
    var tint: Color?
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(16)
            .frame(width: width, height: height, alignment: .topLeading)
            .background {
                ZStack {
                    BD.card
                    if let tint { tint }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

/// The mockups' wallpaper: indigo top left, teal bottom right on near-black.
private struct Wallpaper: View {
    var body: some View {
        ZStack {
            Color(hex: 0x0D0E16)
            RadialGradient(colors: [Color(hex: 0x4B47C9).opacity(0.85), .clear], center: .topLeading, startRadius: 0, endRadius: 420)
            RadialGradient(colors: [Color(hex: 0x1B6A78).opacity(0.75), .clear], center: .bottomTrailing, startRadius: 0, endRadius: 380)
        }
    }
}

extension NotificationQuestion {
    static var sample: NotificationQuestion? {
        NotificationQuestion(userInfo: ["dispatch": [
            "kind": "question", "itemId": 61044, "threadId": "sample-61044", "requestId": "r1", "questionId": "storage",
            "question": "Where should the offline basket live?", "context": "AB#61044 · Offline basket · mac-mini",
            "recommended": 0, "allowCustomAnswer": true,
            "options": [
                ["label": "IndexedDB via idb-keyval", "value": "indexeddb", "description": "Works in the WebView, no native plugin."],
                ["label": "SQLite plugin", "value": "sqlite", "description": "Faster queries, one more native dependency."],
                ["label": "localStorage", "value": "localstorage", "description": "Simplest; 5 MB cap and no indexes."],
            ],
        ] as [String: Any]])
    }
}
#endif
