import SwiftUI

/// A flight strip: one neutral paper, a holder end tinted by item type, and the signal lamp on the left.
struct StripFrame<Holder: View, Content: View>: View {
    let tint: Color
    let lamp: Color
    @ViewBuilder let holder: Holder
    @ViewBuilder let content: Content

    var body: some View {
        HStack(spacing: 0) {
            Rectangle().fill(lamp).frame(width: 3)
            VStack(alignment: .leading, spacing: 2) { holder }
                .padding(.leading, 10)
                .padding(.trailing, 6)
                .padding(.vertical, 9)
                .frame(width: 64, alignment: .leading)
                .frame(maxHeight: .infinity)
                .background(tint)
            VStack(alignment: .leading, spacing: 4) { content }
                .padding(.horizontal, 12)
                .padding(.top, 9)
                .padding(.bottom, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .fixedSize(horizontal: false, vertical: true)
        .background(Palette.paper)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .paperShadow()
    }
}

/// The holder end of a strip: the item number (or worktree) over its type.
struct StripHolder: View {
    let label: String
    let kind: String

    var body: some View {
        Text(label)
            .font(.system(size: 13, weight: .semibold, design: .monospaced))
            .foregroundStyle(Palette.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        Text(kind)
            .font(.caption)
            .foregroundStyle(Palette.inkSoft)
            .lineLimit(2)
    }
}

/// The ADO state under a strip title.
struct StripState: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(Palette.inkSoft)
            .lineLimit(1)
            .truncationMode(.middle)
    }
}

struct StripTitle: View {
    let title: String

    var body: some View {
        Text(title)
            .appFont(13, weight: .semibold, relativeTo: .subheadline)
            .foregroundStyle(Palette.ink)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The worktree an open thread runs in ("M3"); nothing when no agent is on it.
struct WorktreeTag: View {
    let name: String?

    var body: some View {
        if let name {
            Text(name)
                .appFont(19, relativeTo: .headline)
                .foregroundStyle(Palette.ink)
                .lineLimit(1)
                .frame(minWidth: 26, alignment: .leading)
                .fixedSize()
                .accessibilityLabel("Worktree \(name)")
        }
    }
}

// MARK: - Work item strip (My work)

struct ItemStrip: View {
    let entry: ItemOverview
    let onOpen: () -> Void

    @Environment(AppModel.self) private var app

    private var item: WorkItemSummary { entry.item }

    var body: some View {
        StripFrame(tint: item.type.paper, lamp: entry.bay.lamp) {
            StripHolder(label: String(item.id), kind: item.typeAndPriority)
        } content: {
            StripTitle(title: WorkflowRules.shortTitle(item.title))
            StripState(text: stateLabel)
            statusRows.padding(.top, 2)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onOpen)
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: "Open \(item.id)", onOpen)
    }

    private var stateLabel: String {
        if let to = entry.suggestion?.to, to != item.state {
            return "\(WorkflowRules.shortState(item.state)) → \(WorkflowRules.shortState(to))"
        }
        return item.state
    }

    private var openWorktree: String? { entry.openThread?.worktree }

    @ViewBuilder
    private var statusRows: some View {
        switch entry.bay {
        case .waiting: waitingRow
        case .drift: driftRows
        case .working: workingRow
        case .next, .idle: notStartedRow
        case .paused: pausedRow
        case .handed: handedRow
        }
    }

    private var waitingRow: some View {
        let thread = entry.currentThread
        let label = thread.flatMap(\.needsYouLabel) ?? entry.waitingFor ?? "Needs you"
        return HStack(spacing: 10) {
            WorktreeTag(name: thread?.status.isOpen == true ? thread?.worktree : nil)
            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Palette.inkRed)
                if let thread {
                    Text(RelativeTime.ago(thread.lastActivityAt))
                        .font(.caption)
                        .foregroundStyle(Palette.inkSoft)
                }
            }
        }
    }

    @ViewBuilder
    private var driftRows: some View {
        let reason = Text(entry.suggestion?.reason ?? "ADO and the agent disagree.")
            .font(.footnote)
            .foregroundStyle(Palette.inkAmber)
            .lineLimit(3)
            .fixedSize(horizontal: false, vertical: true)
        if let to = entry.suggestion?.to {
            reason
            HStack(spacing: 10) {
                WorktreeTag(name: openWorktree)
                if let pr = entry.pullRequest {
                    Text("PR \(String(pr.number)) \(pr.state.label.lowercased())")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Palette.ink)
                }
                Spacer(minLength: 8)
                Button("Move to \(WorkflowRules.shortState(to))") {
                    Task { await app.moveState(itemId: item.id, to: to) }
                }
                .buttonStyle(.paper(busy: app.isBusy("move:\(item.id)")))
            }
        } else {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                WorktreeTag(name: openWorktree)
                reason
            }
        }
    }

    private var workingRow: some View {
        HStack(spacing: 10) {
            WorktreeTag(name: openWorktree)
            LiveDot()
            Text(entry.openThread?.title ?? "Working")
                .appFont(13, weight: .semibold, relativeTo: .subheadline)
                .foregroundStyle(Palette.ink)
                .lineLimit(1)
        }
    }

    private var notStartedRow: some View {
        HStack(spacing: 10) {
            NotStartedNote(item: item, queuedAt: entry.bay == .next ? entry.queuedAt : nil)
            Spacer(minLength: 8)
            StartButton(item: item, fromBrowse: false)
        }
    }

    private var pausedRow: some View {
        HStack(spacing: 10) {
            WorktreeTag(name: nil)
            if let thread = entry.threads.first {
                Text("Last agent run \(RelativeTime.ago(thread.lastActivityAt)) in \(thread.worktree)")
                    .font(.caption)
                    .foregroundStyle(Palette.inkSoft)
                    .lineLimit(1)
            }
        }
    }

    private var handedRow: some View {
        let who = item.state == "Code Review" ? "Waiting for a reviewer" : "QA has it"
        let pr = entry.pullRequest.map { ", PR \(String($0.number)) \($0.state.label.lowercased())" } ?? ""
        return HStack(spacing: 10) {
            WorktreeTag(name: nil)
            Text(who + pr)
                .font(.caption)
                .foregroundStyle(Palette.inkSoft)
        }
    }
}

/// "Queued 2h ago", or the sprint and due date of an item nobody started.
struct NotStartedNote: View {
    let item: WorkItemSummary
    let queuedAt: String?

    var body: some View {
        HStack(spacing: 8) {
            if let queuedAt {
                Text("Queued \(RelativeTime.ago(queuedAt))")
            } else if let sprint = item.sprintLabel {
                Text(sprint)
            }
            if let due = DueDate(item) {
                Text(due.overdue ? "\(due.label), overdue" : due.label)
                    .foregroundStyle(due.overdue ? Palette.inkRed : Palette.inkSoft)
                    .fontWeight(due.overdue ? .semibold : .regular)
            }
        }
        .font(.caption)
        .foregroundStyle(Palette.inkSoft)
        .lineLimit(1)
    }
}

/// Opens the start sheet; disabled while every worktree is taken.
struct StartButton: View {
    let item: WorkItemSummary
    let fromBrowse: Bool
    var title = "Start"

    @Environment(AppModel.self) private var app

    var body: some View {
        Button(title) { app.router.start(item, fromBrowse: fromBrowse) }
            .buttonStyle(.paper())
            .disabled(app.overview != nil && app.freeWorktrees.isEmpty)
    }
}

// MARK: - Thread without a work item

struct ThreadStrip: View {
    let unlinked: UnlinkedThread

    @Environment(AppModel.self) private var app

    private var thread: ThreadSummary { unlinked.thread }

    var body: some View {
        StripFrame(tint: Palette.Paper.thread, lamp: thread.status == .running ? Palette.Signal.working : Palette.Signal.idle) {
            StripHolder(label: thread.worktree, kind: RelativeTime.ago(thread.lastActivityAt))
        } content: {
            Text(thread.needsYouLabel ?? thread.status.sentence)
                .font(.caption)
                .foregroundStyle(Palette.inkSoft)
            StripTitle(title: thread.title)
            HStack(spacing: 10) {
                if thread.status == .running { LiveDot() }
                Text(unlinked.guessItemId.map { "Looks like AB \(String($0))" } ?? "No matching work item found")
                    .font(.caption)
                    .foregroundStyle(Palette.inkSoft)
                Spacer(minLength: 8)
                if let guess = unlinked.guessItemId {
                    Button("Link to \(String(guess))") {
                        Task { await app.link(thread, to: guess) }
                    }
                    .buttonStyle(.paper(.secondary, busy: app.isBusy("link:\(thread.id)")))
                }
            }
            .padding(.top, 2)
        }
        .contentShape(Rectangle())
        .onTapGesture { T3Link.open(thread) }
        .accessibilityElement(children: .contain)
        .accessibilityHint("Opens the thread in T3")
    }
}
