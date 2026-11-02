import SwiftUI

/// The Activity journal: filters by category, the catch-up card, entries grouped by day. Swipe to mark read,
/// tap to land on the pull request, item, thread or CI group.
struct ActivityView: View {
    @Environment(AppModel.self) private var app

    private var store: ActivityStore { app.activity }

    var body: some View {
        List {
            Section {
                if let away = store.away, store.filter == nil {
                    AwayCard(away: away)
                        .listRowInsets(EdgeInsets(top: 10, leading: 0, bottom: 0, trailing: 0))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
                if let error = store.loadError, store.entries.isEmpty {
                    StatusCard(icon: "exclamationmark.triangle", text: error, tone: .warn)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                } else if store.entries.isEmpty && !store.isLoading {
                    StatusCard(icon: "tray", text: "Nothing here yet. New reviews, CI failures, finished agents and merges land here.", tone: .mute)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
            } header: {
                header
                    .textCase(nil)
                    .padding(.horizontal, -20)
                    .padding(.bottom, 2)
            }
            ForEach(ActivityDay.group(store.entries)) { day in
                Section {
                    ForEach(day.entries) { entry in
                        Button { store.open(entry) } label: { ActivityRow(entry: entry) }
                            .buttonStyle(.plain)
                            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                            .listRowBackground(BD.card)
                            .alignmentGuide(.listRowSeparatorLeading) { _ in 74 }
                            .swipeActions(edge: .trailing) {
                                if !entry.read {
                                    Button { Task { await store.markRead(entry) } } label: { Label("Read", systemImage: "envelope.open") }
                                        .tint(BD.accent)
                                }
                            }
                            .onAppear { if entry.id == store.entries.last?.id { Task { await store.loadMore() } } }
                            .accessibilityIdentifier("activity-\(entry.id)")
                    }
                } header: {
                    Text(day.title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(BD.text2)
                        .textCase(nil)
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(4)
        .scrollContentBackground(.hidden)
        .background(BD.bg)
        .refreshable { await store.refresh() }
        .navigationTitle("Activity")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Mark all read") { Task { await store.markAllRead() } }
                    .disabled(store.unread == 0)
                    .accessibilityIdentifier("mark-all-read")
            }
        }
        .tint(BD.text)
        .task { await store.refresh() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(subtitle)
                .font(.system(size: 17))
                .foregroundStyle(BD.text2)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    pill(nil, title: "All")
                    ForEach(ActivityCategory.allCases) { category in
                        pill(category, title: category.filterTitle)
                    }
                }
            }
            .scrollClipDisabled()
        }
    }

    private var subtitle: String {
        if store.unread == 0 { return "You're all caught up." }
        if let away = store.away { return "\(store.unread) new since you left your desk at \(CompactTime.clock(away.from))" }
        return "\(store.unread) new"
    }

    private func pill(_ category: ActivityCategory?, title: String) -> some View {
        Button { Task { await store.select(category) } } label: {
            BucketPill(title: title, count: store.unread(category), selected: store.filter == category)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("activity-filter-\(category?.rawValue ?? "all")")
    }
}

/// "While you were away · 17:40 – 21:05" with four counts.
private struct AwayCard: View {
    let away: ActivityPage.Away

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("While you were away · \(CompactTime.clock(away.from)) – \(CompactTime.clock(away.to))")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(BD.text2)
            HStack(alignment: .top) {
                stat(away.merged, "merged", BD.merged)
                stat(away.ciFailures, "CI failures", BD.red)
                stat(away.agentsDone, "agents done", BD.accent)
                stat(away.other, "other", BD.text)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .bdCard(radius: 22)
    }

    private func stat(_ value: Int, _ label: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(String(value)).font(.system(size: 26, weight: .bold)).foregroundStyle(color).monospacedDigit()
            Text(label).font(.system(size: 13)).foregroundStyle(BD.text2).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct ActivityRow: View {
    let entry: ActivityEntry

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(entry.read ? .clear : BD.accent)
                .frame(width: 8, height: 8)
                .padding(.top, 15)
                .padding(.leading, 6)
            Image(systemName: entry.symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(entry.iconColor)
                .frame(width: 36, height: 36)
                .background(entry.iconColor.opacity(0.16), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(entry.title)
                        .font(.system(size: 16.5, weight: entry.read ? .regular : .medium))
                        .foregroundStyle(BD.text)
                        .lineLimit(2)
                    Spacer(minLength: 8)
                    Text(CompactTime.clock(entry.at))
                        .font(.system(size: 14))
                        .foregroundStyle(BD.text3)
                        .monospacedDigit()
                }
                Text(entry.detail)
                    .font(.system(size: 14.5))
                    .foregroundStyle(BD.text2)
                    .lineLimit(1)
            }
        }
        .padding(.trailing, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(entry.read ? "" : "Unread")
    }
}

/// Entries grouped by day, newest first: "Today", "Yesterday", "Tue 28 Oct".
struct ActivityDay: Identifiable, Equatable {
    let title: String
    let entries: [ActivityEntry]
    var id: String { title }

    static func group(_ entries: [ActivityEntry], now: Date = .now, calendar: Calendar = .current) -> [ActivityDay] {
        var order: [String] = []
        var byDay: [String: [ActivityEntry]] = [:]
        for entry in entries {
            let date = ISODate.parse(entry.at) ?? now
            let title: String = if calendar.isDate(date, inSameDayAs: now) {
                calendar.component(.hour, from: date) >= 18 && calendar.component(.hour, from: now) >= 18 ? "Tonight" : "Today"
            } else if let yesterday = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(date, inSameDayAs: yesterday) {
                "Yesterday"
            } else {
                date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
            }
            if byDay[title] == nil { order.append(title) }
            byDay[title, default: []].append(entry)
        }
        return order.map { ActivityDay(title: $0, entries: byDay[$0] ?? []) }
    }
}

extension ActivityCategory {
    var filterTitle: String {
        switch self {
        case .review: "Reviews"
        case .ci: "CI"
        case .agent: "Agents"
        case .merge: "Merges"
        case .workitem: "Work items"
        case .comment: "Comments"
        }
    }
}

extension ActivityEntry {
    var symbol: String {
        switch category {
        case .review: tone == .ok ? "checkmark" : "eye"
        case .ci: "xmark"
        case .agent: "cpu"
        case .merge: "arrow.triangle.merge"
        case .workitem: "arrow.right"
        case .comment: "bubble.left"
        }
    }

    var iconColor: Color {
        switch category {
        case .review: tone == .ok ? BD.green : tone.color
        case .ci: BD.red
        case .agent: BD.accent
        case .merge: BD.merged
        case .workitem: BD.blue
        case .comment: BD.text2
        }
    }
}
