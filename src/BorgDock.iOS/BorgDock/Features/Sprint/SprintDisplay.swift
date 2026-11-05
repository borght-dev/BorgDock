import SwiftUI

/// The words and colours the Sprint tab and Today's tile share.
enum SprintDisplay {
    /// "2 – 13 Nov", or "28 Oct – 7 Nov" across a month.
    static func range(_ sprint: Sprint) -> String? {
        guard let start = SprintCalendar.day(ofSprintDate: sprint.startDate),
              let finish = SprintCalendar.day(ofSprintDate: sprint.finishDate) else { return nil }
        let utc = SprintCalendar.utc
        let day = Date.FormatStyle(timeZone: utc.timeZone).day()
        let dayMonth = Date.FormatStyle(timeZone: utc.timeZone).day().month(.abbreviated)
        let sameMonth = utc.component(.month, from: start) == utc.component(.month, from: finish)
        return "\((sameMonth ? day : dayMonth).format(start)) – \(dayMonth.format(finish))"
    }

    /// "day 4 of 10 · 6 days left".
    static func progress(_ stats: SprintStats) -> String? {
        guard let days = stats.workingDays, let today = stats.today, let left = stats.daysLeft else { return nil }
        if today == 0 { return "starts soon · \(days) days" }
        let remaining = switch left {
        case 0: "last day"
        case 1: "1 day left"
        default: "\(left) days left"
        }
        return "day \(today) of \(days) · \(remaining)"
    }

    /// "3 behind ideal", "2 ahead", "on track".
    static func pace(_ stats: SprintStats) -> (text: String, tone: Tone)? {
        guard let behind = stats.behindIdeal else { return nil }
        if behind > 0 { return ("\(behind) behind ideal", .warn) }
        if behind < 0 { return ("\(-behind) ahead", .ok) }
        return ("On track", .ok)
    }

    /// The progress bar's ramp: finished items darkest.
    static func color(_ stage: SprintStage) -> Color {
        switch stage {
        case .done: BD.accent
        case .qa: BD.accent.opacity(0.78)
        case .review: BD.accent.opacity(0.55)
        case .active: BD.accent.opacity(0.3)
        case .new: BD.fill2
        }
    }
}

/// Done, QA, review, active and new as one bar.
struct SprintStageBar: View {
    let stats: SprintStats
    var height: CGFloat = 10

    var body: some View {
        GeometryReader { geometry in
            let stages = SprintStage.allCases.filter { (stats.count[$0] ?? 0) > 0 }
            let gaps = CGFloat(max(0, stages.count - 1)) * 2
            HStack(spacing: 2) {
                ForEach(stages, id: \.self) { stage in
                    SprintDisplay.color(stage)
                        .frame(width: max(0, (geometry.size.width - gaps) * CGFloat(stats.count[stage] ?? 0) / CGFloat(max(1, stats.total))))
                }
            }
        }
        .frame(height: height)
        .background(BD.fill)
        .clipShape(Capsule())
        .accessibilityElement()
        .accessibilityLabel(SprintStage.allCases.map { "\(stats.count[$0] ?? 0) \($0.title)" }.joined(separator: ", "))
    }
}
