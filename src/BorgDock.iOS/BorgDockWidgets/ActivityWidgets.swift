import ActivityKit
import SwiftUI
import WidgetKit

// The two things that run while you wait: an agent's thread and a pull request's checks. The server pushes their
// content state (`AgentActivityState`, `ChecksActivityState`) and ends them when the work settles.

struct AgentLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AgentActivityAttributes.self) { context in
            AgentLockScreenView(attributes: context.attributes, state: context.state)
                .padding(16)
                .activityBackgroundTint(BD.card.opacity(0.92))
                .activitySystemActionForegroundColor(BD.text)
                .widgetURL(BorgDockLink.thread(context.attributes.threadId))
        } dynamicIsland: { context in
            let state = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    BDAppTile(size: 46).padding(.leading, 4).padding(.top, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    IslandTitle(context: context.attributes.context, title: context.attributes.title)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    AgentTimer(state: state, size: 20).padding(.top, 14).padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    AgentIslandBottom(threadId: context.attributes.threadId, state: state)
                }
            } compactLeading: {
                BDMark().fill(BD.brandIndigo).frame(width: 18, height: 18).padding(.leading, 2)
            } compactTrailing: {
                AgentTimer(state: state, size: 15)
            } minimal: {
                BDMark().fill(BD.brandIndigo).frame(width: 16, height: 16)
            }
            .widgetURL(BorgDockLink.thread(context.attributes.threadId))
            .keylineTint(BD.brandIndigo)
        }
    }
}

struct ChecksLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ChecksActivityAttributes.self) { context in
            ChecksLockScreenView(attributes: context.attributes, state: context.state)
                .padding(16)
                .activityBackgroundTint(BD.card.opacity(0.92))
                .activitySystemActionForegroundColor(BD.text)
                .widgetURL(BorgDockLink.pullRequest(key: context.attributes.prKey))
        } dynamicIsland: { context in
            let state = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ChecksRing(state: state, size: 40, lineWidth: 5).padding(.leading, 6).padding(.top, 6)
                }
                DynamicIslandExpandedRegion(.center) {
                    IslandTitle(context: "#\(context.attributes.number) · checks", title: context.attributes.title)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ChecksCount(state: state, size: 20).padding(.top, 14).padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(ChecksLockScreenView.summary(state))
                        .font(.system(size: 15))
                        .foregroundStyle(.white.opacity(0.75))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 6)
                        .padding(.top, 4)
                }
            } compactLeading: {
                ChecksRing(state: state, size: 20, lineWidth: 3).padding(.leading, 2)
            } compactTrailing: {
                ChecksCount(state: state)
            } minimal: {
                ChecksRing(state: state, size: 18, lineWidth: 3)
            }
            .widgetURL(BorgDockLink.pullRequest(key: context.attributes.prKey))
            .keylineTint(state.failed > 0 ? Color(hex: 0xF0616D) : Color(hex: 0x5CC98F))
        }
    }
}

/// An approval waiting out its Undo window. The app starts and ends it; Undo (expanded, lock screen) runs
/// `UndoApprovalIntent`, and tapping the compact island opens the app's undo link.
struct ApprovalLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ApprovalActivityAttributes.self) { context in
            ApprovalLockScreenView(attributes: context.attributes, state: context.state)
                .padding(16)
                .activityBackgroundTint(BD.card.opacity(0.92))
                .activitySystemActionForegroundColor(BD.text)
                .widgetURL(BorgDockLink.pullRequest(key: context.attributes.prKey))
        } dynamicIsland: { context in
            let attributes = context.attributes
            let state = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(Color(hex: 0x5CC98F))
                        .frame(width: 40, height: 40)
                        .background(Color(hex: 0x5CC98F).opacity(0.18), in: Circle())
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    ApprovalIslandTitle(attributes: attributes, state: state)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if state.phase == .holding {
                        ApprovalCountdown(state: state, size: 20)
                            .foregroundStyle(.white)
                            .frame(width: 56, alignment: .trailing)
                            .padding(.top, 8)
                            .padding(.trailing, 4)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ApprovalIslandBottom(attributes: attributes, state: state)
                }
            } compactLeading: {
                ApprovalCompactLeading(state: state)
            } compactTrailing: {
                ApprovalCompactTrailing(attributes: attributes, state: state)
            } minimal: {
                ApprovalMinimal(state: state)
            }
            .widgetURL(state.phase == .holding ? ApprovalUndoLink.url(holdId: attributes.holdId) : BorgDockLink.pullRequest(key: attributes.prKey))
            .keylineTint(Color(hex: 0x5CC98F))
        }
    }
}
