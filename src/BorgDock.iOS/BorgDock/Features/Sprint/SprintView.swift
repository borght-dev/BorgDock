import Charts
import SwiftUI

/// The Sprint tab: the team's current sprint as a burndown, a bar of where the items are, what looks stuck and who
/// has what. Team or only mine.
struct SprintView: View {
    @Environment(AppModel.self) private var app
    @AppStorage("sprint.scope") private var scope: SprintScope = .team

    var body: some View {
        let store = app.sprint
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let sprint = store.sprint {
                    let stats = SprintStats(sprint: sprint, scope: scope)
                    Picker("Whose items", selection: $scope) {
                        ForEach(SprintScope.allCases) { option in
                            Text("\(option.title) \(SprintStats(sprint: sprint, scope: option).total)").tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("sprint-scope")
                    .padding(.horizontal, 16)
                    BurndownCard(stats: stats).padding(.horizontal, 16)
                    StagesCard(stats: stats).padding(.horizontal, 16)
                    WatchCard(stats: stats)
                    if scope == .team, !stats.people.isEmpty { PeopleCard(stats: stats) }
                } else if let error = store.error {
                    ContentUnavailableView {
                        Label("Can't load the sprint", systemImage: "chart.line.downtrend.xyaxis")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Try again") { Task { await store.load(reportErrors: true) } }.buttonStyle(.bordered)
                    }
                    .padding(.top, 40)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
                }
            }
            .padding(.bottom, 24)
        }
        .background(BD.bg)
        .navigationTitle(store.sprint.map { "Sprint \($0.name)" } ?? "Sprint")
        .navigationSubtitle(subtitle(store.sprint))
        .tint(BD.text)
        .refreshable { await store.load(reportErrors: true) }
        .task { await store.poll() }
    }

    private func subtitle(_ sprint: Sprint?) -> String {
        guard let sprint else { return "" }
        let stats = SprintStats(sprint: sprint, scope: .team)
        return [SprintDisplay.range(sprint), SprintDisplay.progress(stats)].compactMap(\.self).joined(separator: " · ")
    }
}

/// Items left per day against the ideal line, and where the pace so far ends up.
private struct BurndownCard: View {
    let stats: SprintStats

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(stats.remaining)").font(.system(size: 32, weight: .bold)).monospacedDigit()
                Text(stats.remaining == 1 ? "item to go" : "items to go").font(.system(size: 15)).foregroundStyle(BD.text2)
                Spacer(minLength: 4)
                if let pace = SprintDisplay.pace(stats) { ToneChip(text: pace.text, tone: pace.tone) }
            }
            if let workingDays = stats.workingDays, workingDays > 0, let start = stats.burndown.first?.remaining {
                BurndownChart(stats: stats, workingDays: workingDays, start: start)
                    .frame(height: 150)
                legend
            } else {
                Text("ADO gives this sprint no dates, so there is no burndown.").font(.system(size: 14)).foregroundStyle(BD.text2)
            }
        }
        .padding(16)
        .bdCard(radius: 20)
    }

    private var legend: some View {
        HStack(spacing: 14) {
            LegendSwatch(title: "Left") { Capsule().fill(BD.accent).frame(width: 14, height: 3) }
            LegendSwatch(title: "Ideal") { DashLine().stroke(BD.text3, style: StrokeStyle(lineWidth: 1.5, dash: [3, 3])).frame(width: 14, height: 2) }
            if let forecast = stats.forecastLeft {
                LegendSwatch(title: forecast == 0 ? "At this pace: done" : "At this pace: ~\(forecast) left") {
                    DashLine().stroke(BD.accent.opacity(0.6), style: StrokeStyle(lineWidth: 2.2, lineCap: .round, dash: [1, 3])).frame(width: 14, height: 2)
                }
            }
        }
        .font(.system(size: 12))
        .foregroundStyle(BD.text2)
    }
}

struct BurndownChart: View {
    let stats: SprintStats
    let workingDays: Int
    let start: Int
    var showsAxis = true

    var body: some View {
        if showsAxis {
            chart.chartXAxis {
                AxisMarks(values: Array(stride(from: 0.5, to: Double(workingDays), by: 1))) { value in
                    AxisValueLabel {
                        if let position = value.as(Double.self) { Text(weekdayLetter(Int(position))) }
                    }
                }
            }
        } else {
            chart.chartXAxis(.hidden)
        }
    }

    private var chart: some View {
        let today = stats.burndown.last
        return Chart {
            LineMark(x: .value("Day", 0), y: .value("Left", start), series: .value("Line", "Ideal"))
                .foregroundStyle(BD.text3)
                .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 5]))
            LineMark(x: .value("Day", workingDays), y: .value("Left", 0), series: .value("Line", "Ideal"))
                .foregroundStyle(BD.text3)
                .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 5]))
            ForEach(stats.burndown) { point in
                AreaMark(x: .value("Day", point.day), y: .value("Left", point.remaining))
                    .foregroundStyle(BD.accent.opacity(0.1))
                LineMark(x: .value("Day", point.day), y: .value("Left", point.remaining), series: .value("Line", "Left"))
                    .foregroundStyle(BD.accent)
                    .lineStyle(StrokeStyle(lineWidth: 2.6, lineCap: .round, lineJoin: .round))
            }
            if let today, let forecast = stats.forecastLeft, today.day < workingDays {
                LineMark(x: .value("Day", today.day), y: .value("Left", today.remaining), series: .value("Line", "Forecast"))
                    .foregroundStyle(BD.accent.opacity(0.6))
                    .lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round, dash: [1, 5]))
                LineMark(x: .value("Day", workingDays), y: .value("Left", forecast), series: .value("Line", "Forecast"))
                    .foregroundStyle(BD.accent.opacity(0.6))
                    .lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round, dash: [1, 5]))
            }
            if let today, today.day > 0 {
                RuleMark(x: .value("Day", today.day)).foregroundStyle(BD.text3.opacity(0.5)).lineStyle(StrokeStyle(lineWidth: 1))
                PointMark(x: .value("Day", today.day), y: .value("Left", today.remaining))
                    .foregroundStyle(BD.accent)
                    .symbolSize(showsAxis ? 70 : 40)
            }
        }
        .chartXScale(domain: 0...workingDays)
        .chartYScale(domain: 0...max(1, start))
        .chartYAxis(.hidden)
        .chartLegend(.hidden)
        .accessibilityElement()
        .accessibilityLabel(accessibilityText)
    }

    private func weekdayLetter(_ index: Int) -> String {
        guard stats.days.indices.contains(index) else { return "" }
        let symbols = SprintCalendar.utc.veryShortWeekdaySymbols
        return symbols[SprintCalendar.utc.component(.weekday, from: stats.days[index]) - 1]
    }

    private var accessibilityText: String {
        var parts = ["Burndown: \(stats.remaining) of \(stats.total) items left"]
        if let pace = SprintDisplay.pace(stats) { parts.append(pace.text) }
        if let forecast = stats.forecastLeft { parts.append("about \(forecast) left at the finish at this pace") }
        return parts.joined(separator: ", ")
    }
}

private struct StagesCard: View {
    let stats: SprintStats

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("By state").font(.system(size: 16, weight: .semibold))
                Spacer()
                Text("\(stats.percentDone)% done").font(.system(size: 13.5)).foregroundStyle(BD.text2)
            }
            SprintStageBar(stats: stats)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: 3), alignment: .leading, spacing: 7) {
                ForEach(SprintStage.allCases, id: \.self) { stage in
                    HStack(spacing: 6) {
                        RoundedRectangle(cornerRadius: 2).fill(SprintDisplay.color(stage)).frame(width: 9, height: 9)
                        Text("\(stats.count[stage] ?? 0)").fontWeight(.semibold).foregroundStyle(BD.text).monospacedDigit()
                        Text(stage.title).foregroundStyle(BD.text2)
                    }
                    .font(.system(size: 13.5))
                }
            }
        }
        .padding(16)
        .bdCard(radius: 20)
    }
}

/// What looks stuck: long in review, blocked, nobody on it.
private struct WatchCard: View {
    let stats: SprintStats

    private var rows: [(list: SprintList, count: Int, icon: String, tone: Tone)] {
        [
            (.longInReview, stats.longInReview.count, "clock", .warn),
            (.blocked, stats.blocked.count, "exclamationmark.triangle", .bad),
            (.unassigned, stats.unassigned.count, "person.crop.circle.badge.questionmark", .mute),
        ].filter { $0.count > 0 }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CellGroupHeader(title: "Watch").padding(.top, -8)
            if rows.isEmpty {
                StatusCard(icon: "checkmark.circle", text: "Nothing looks stuck.", tone: .ok).padding(.top, -12)
            } else {
                CellGroup(indent: 58) {
                    ForEach(rows, id: \.list) { row in
                        NavigationLink(value: Route.sprintItems(row.list)) {
                            SprintRowLabel(title: row.list.title, count: row.count) {
                                Image(systemName: row.icon)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(row.tone.color)
                                    .frame(width: 30, height: 30)
                                    .background(row.tone.soft, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("sprint-watch-\(row.list.title)")
                    }
                }
            }
        }
    }
}

private struct PeopleCard: View {
    let stats: SprintStats

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CellGroupHeader(title: "People").padding(.top, -8)
            CellGroup(indent: 58) {
                ForEach(stats.people) { person in
                    NavigationLink(value: Route.sprintItems(.person(person.name))) {
                        HStack(spacing: 12) {
                            if let name = person.name {
                                PersonAvatar(name: person.isMe ? PersonNames.firstAndLast(name) : name, size: 30)
                            } else {
                                Image(systemName: "person.crop.circle.dashed").font(.system(size: 26)).foregroundStyle(BD.text3).frame(width: 30)
                            }
                            Text(person.isMe ? "You" : person.name.map(PersonNames.first) ?? "Unassigned")
                                .font(.system(size: 15.5))
                                .foregroundStyle(BD.text)
                                .frame(width: 86, alignment: .leading)
                                .lineLimit(1)
                            ProgressView(value: Double(person.done), total: Double(max(1, person.total)))
                                .tint(BD.accent)
                            Text("\(person.done)/\(person.total)")
                                .font(.system(size: 13.5))
                                .foregroundStyle(BD.text2)
                                .monospacedDigit()
                                .frame(width: 38, alignment: .trailing)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 9)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct SprintRowLabel<Icon: View>: View {
    let title: String
    let count: Int
    @ViewBuilder let icon: Icon

    var body: some View {
        HStack(spacing: 12) {
            icon
            Text(title).font(.system(size: 15.5)).foregroundStyle(BD.text)
            Spacer(minLength: 8)
            Text("\(count)").font(.system(size: 15.5, weight: .semibold)).foregroundStyle(BD.text2).monospacedDigit()
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(BD.text3)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 9)
        .contentShape(Rectangle())
    }
}

private struct LegendSwatch<Swatch: View>: View {
    let title: String
    @ViewBuilder let swatch: Swatch

    var body: some View {
        HStack(spacing: 5) {
            swatch
            Text(title)
        }
    }
}

/// A horizontal line through the middle, for the legend's dashed swatches.
private struct DashLine: Shape {
    func path(in rect: CGRect) -> Path {
        Path { path in
            path.move(to: CGPoint(x: rect.minX, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        }
    }
}

/// One of the sprint's lists: an item per row, opening its detail.
struct SprintItemsView: View {
    @Environment(AppModel.self) private var app
    let list: SprintList

    var body: some View {
        let items = app.sprint.sprint.flatMap { sprint in app.sprint.stats(.team).map { $0.items(list, in: sprint) } } ?? []
        ScrollView {
            if items.isEmpty {
                StatusCard(icon: "checkmark.circle", text: "Nothing here any more.", tone: .ok)
            } else {
                CellGroup {
                    ForEach(items) { entry in
                        Button { app.router.push(ItemRoute(id: entry.id, prefill: entry.item)) } label: { SprintItemRow(entry: entry) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(.top, 8)
            }
        }
        .background(BD.bg)
        .navigationTitle(list.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct SprintItemRow: View {
    let entry: SprintItem

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 7) {
                WorkItemGlyph(typeName: entry.item.typeName, size: 11)
                Text("AB#\(String(entry.item.id))")
                Spacer(minLength: 8)
                Text(entry.item.state).fontWeight(.semibold).foregroundStyle(BD.text)
            }
            .font(.system(size: 13))
            .foregroundStyle(BD.text2)
            Text(entry.item.title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(BD.text)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            Text(detail).font(.system(size: 13.5)).foregroundStyle(BD.text2)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var detail: String {
        let who = entry.item.assignedTo ?? "Unassigned"
        guard let changed = entry.stateChangedAt, !ShortTime.age(changed).isEmpty else { return who }
        return "\(who) · \(entry.item.state) for \(ShortTime.age(changed))"
    }
}
