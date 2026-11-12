import SwiftUI

/// The Work tab (Dispatch's States view), the morning walk: the briefing, Fix out of sync and Sync all, then one lane
/// per ADO state (in your order) or per status, with each item's verdict, how far it is through its workflow, its
/// evidence and latest message.
struct OverviewView: View {
    @Environment(AppModel.self) private var app
    @AppStorage("work.grouping") private var grouping: WorkGrouping = .state
    @AppStorage("work.laneOrder") private var laneOrder = ""
    @State private var editingOrder = false

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let overview = app.overview {
                        content(overview)
                    } else if let error = app.overviewError {
                        StatusCard(icon: "exclamationmark.triangle", text: error, tone: .warn)
                        Button("Try again") { Task { await app.refreshOverview() } }
                            .buttonStyle(.bd(.plain, height: 44))
                            .padding(16)
                    } else {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
                    }
                }
                .padding(.bottom, 24)
            }
            .onChange(of: app.router.scrollTarget) { _, target in
                guard let target else { return }
                withAnimation { proxy.scrollTo(target, anchor: .top) }
                app.router.scrollTarget = nil
            }
        }
        .background(BD.bg)
        .refreshable { await app.refreshFromSources() }
        .navigationTitle("My work")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { app.router.push(.browse) } label: { Image(systemName: "square.3.layers.3d") }
                    .accessibilityLabel("Browse work items")
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                Menu {
                    Picker("Group", selection: $grouping) {
                        ForEach(WorkGrouping.allCases) { Text($0.title).tag($0) }
                    }
                    Button("Lane order…", systemImage: "line.3.horizontal") { editingOrder = true }
                } label: {
                    Image(systemName: "arrow.up.arrow.down")
                }
                .accessibilityLabel("Sort")
                .accessibilityIdentifier("work-sort")
                Button { Task { await app.refreshFromSources() } } label: { Image(systemName: "arrow.triangle.2.circlepath") }
                    .accessibilityLabel("Refresh from ADO and T3")
                Button { app.router.present(.launch(LaunchContext())) } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Start an agent")
            }
        }
        .tint(BD.text)
        .sheet(isPresented: $editingOrder) {
            LaneOrderSheet(stored: $laneOrder, states: LaneOrder.states(saved: LaneOrder.decode(laneOrder), overview: app.overview))
        }
    }

    @ViewBuilder
    private func content(_ overview: Overview) -> some View {
        let briefing = WalkDisplay.briefing(overview)
        BriefingLine(parts: WalkDisplay.briefingParts(briefing))
            .padding(.horizontal, 20)
        actions(overview, briefing: briefing)
        SourceWarnings(sources: overview.sources)
        let lanes = WalkDisplay.lanes(overview, grouping: grouping, order: LaneOrder.decode(laneOrder))
        ForEach(lanes) { lane in
            CellGroupHeader(title: lane.title, trailing: String(lane.entries.count))
                .id(lane.title)
            CellGroup {
                ForEach(lane.entries) { entry in
                    Button { app.router.push(ItemRoute(id: entry.item.id)) } label: { WalkRow(entry: entry, showsState: grouping == .status) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("walk-item-\(entry.item.id)")
                }
            }
        }
        if !overview.unlinkedThreads.isEmpty {
            CellGroupHeader(title: "Threads without an item", trailing: String(overview.unlinkedThreads.count))
            CellGroup(indent: 16) {
                ForEach(overview.unlinkedThreads) { unlinked in
                    AgentRow(thread: unlinked.thread, subject: unlinked.thread.branch)
                }
            }
        }
        if lanes.isEmpty && overview.unlinkedThreads.isEmpty {
            StatusCard(icon: "checkmark.circle", text: "No work items assigned to you. Browse to pick one up.", tone: .ok)
        }
        if let error = app.overviewError {
            Text("Couldn't refresh: \(error)")
                .font(.system(size: 13))
                .foregroundStyle(BD.text3)
                .padding(.horizontal, 32)
                .padding(.top, 12)
        }
    }

    private func actions(_ overview: Overview, briefing: Walk.Briefing) -> some View {
        HStack(spacing: 8) {
            let outOfSync = WalkDisplay.outOfSyncItemIds(overview)
            if briefing.outOfSync > 0 {
                Button {
                    app.router.present(.launch(.sync(itemIds: outOfSync, outOfSyncOnly: true)))
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 13, weight: .semibold))
                        Text("Fix out of sync")
                        Text(String(briefing.outOfSync)).opacity(0.7)
                    }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(BD.yellow)
                    .padding(.horizontal, 14)
                    .frame(height: 36)
                    .background(BD.yellowSoft, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("fix-out-of-sync")
            }
            Button {
                app.router.present(.launch(.sync(itemIds: WalkDisplay.activeItemIds(overview), outOfSyncOnly: false)))
            } label: {
                Text("Sync all")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(BD.text)
                    .padding(.horizontal, 14)
                    .frame(height: 36)
                    .background(BD.fill2, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }
}

/// "2 need you · 3 out of sync · 4 agents running".
private struct BriefingLine: View {
    let parts: [WalkDisplay.BriefingPart]

    var body: some View {
        parts.enumerated().reduce(Text("")) { text, part in
            let separator = part.offset == 0 ? Text("") : Text(" · ").foregroundStyle(BD.text2)
            let piece = Text(part.element.text)
                .foregroundStyle(part.element.tone?.color ?? BD.text2)
                .fontWeight(part.element.tone == nil ? .regular : .semibold)
            return Text("\(text)\(separator)\(piece)")
        }
        .font(.system(size: 17))
        .accessibilityIdentifier("walk-briefing")
    }
}

/// One item in a lane: AB# and verdict, title, evidence chips, the latest message.
struct WalkRow: View {
    let entry: ItemOverview
    /// Grouped by status, the lane no longer names the state, so the row does.
    var showsState = false

    var body: some View {
        let verdict = WalkDisplay.verdict(for: entry)
        let evidence = WalkDisplay.evidence(for: entry)
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                WorkItemGlyph(typeName: entry.item.typeName, size: 11)
                Text("AB#\(String(entry.item.id))")
                if showsState { Text("· \(entry.item.state)").lineLimit(1) }
                Spacer(minLength: 8)
                VerdictChip(verdict: verdict)
            }
            .font(.system(size: 13))
            .foregroundStyle(BD.text2)
            Text(entry.item.title)
                .font(.system(size: 16.5, weight: .semibold))
                .foregroundStyle(BD.text)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .padding(.top, 4)
            WorkflowProgress(item: entry.item).padding(.top, 9)
            if !evidence.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 5) {
                        ForEach(Array(evidence.enumerated()), id: \.offset) { _, item in
                            ToneChip(text: item.label, tone: item.tone ?? .mute, systemImage: WalkDisplay.symbol(for: item.kind, tone: item.tone), small: true)
                        }
                    }
                }
                .scrollDisabled(true)
                .padding(.top, 8)
            }
            if let latest = WalkDisplay.latest(for: entry) {
                Text("\(Text("\(latest.by) — ").foregroundStyle(BD.text).fontWeight(.medium))\(Text(WalkDisplay.oneLine(latest.text)).foregroundStyle(BD.text2))")
                    .font(.system(size: 14))
                    .lineLimit(1)
                    .padding(.top, 7)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

/// How far an item is through its workflow: a segment per state, filled up to the one it is in.
struct WorkflowProgress: View {
    let item: WorkItemSummary

    var body: some View {
        if let index = item.workflow.firstIndex(of: item.state) {
            HStack(spacing: 3) {
                ForEach(item.workflow.indices, id: \.self) { step in
                    Capsule().fill(step <= index ? BD.accent : BD.fill2).frame(height: 4)
                }
            }
            .accessibilityElement()
            .accessibilityLabel("\(item.state), step \(index + 1) of \(item.workflow.count)")
        }
    }
}

/// The verdict in its tone; a pulsing dot while an agent runs.
struct VerdictChip: View {
    let verdict: Verdict

    var body: some View {
        HStack(spacing: 5) {
            if verdict.tone == .run { PulseDot(color: BD.blue, size: 6) }
            Text(verdict.label).lineLimit(1)
        }
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(verdict.tone.color)
        .padding(.horizontal, 9)
        .frame(height: 25)
        .background(verdict.tone.soft, in: Capsule())
        .fixedSize()
    }
}

/// A warning or empty state in a card.
struct StatusCard: View {
    let icon: String
    let text: String
    var tone: Tone = .mute

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon).foregroundStyle(tone.color)
            Text(text).foregroundStyle(BD.text).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .font(.system(size: 14.5))
        .padding(14)
        .background(tone.soft, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }
}

/// ADO or a machine that isn't syncing, above the lanes.
private struct SourceWarnings: View {
    let sources: OverviewSources

    var body: some View {
        if !sources.ado.ok {
            StatusCard(icon: "exclamationmark.triangle", text: "Azure DevOps isn't syncing\(detail(sources.ado.error, sources.ado.at))", tone: .warn)
        }
        if let environments = sources.environments {
            ForEach(environments.filter { !$0.ok }) { environment in
                StatusCard(icon: "desktopcomputer.trianglebadge.exclamationmark", text: "\(environment.label) is offline\(detail(environment.error, environment.at))", tone: .warn)
            }
        } else if !sources.t3.ok {
            StatusCard(icon: "exclamationmark.triangle", text: "T3 Code isn't reachable\(detail(sources.t3.error, sources.t3.at))", tone: .warn)
        }
    }

    private func detail(_ error: String?, _ at: String?) -> String {
        var text = error.map { ": \($0)" } ?? ""
        if let at { text += ". Last good sync \(RelativeTime.ago(at))." }
        return text.isEmpty ? "." : text
    }
}
