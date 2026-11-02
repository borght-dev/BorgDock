import SwiftUI
import WidgetKit

// Views shared by the widget extension and the app (the app renders them in its DEBUG gallery for screenshots).

struct FocusWidgetView: View {
    let snapshot: WidgetSnapshot

    var body: some View {
        let focus = snapshot.focus
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: "Focus") {
                Text(focus.needYou > 0 ? "\(focus.needYou) need you" : "All clear")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(focus.needYou > 0 ? BD.red : BD.green)
            }
            Spacer(minLength: 6)
            if focus.top.isEmpty {
                Text("Nothing needs you right now.")
                    .font(.system(size: 14))
                    .foregroundStyle(BD.text2)
            } else {
                VStack(alignment: .leading, spacing: 9) {
                    ForEach(focus.top.prefix(3)) { row in
                        if let url = BorgDockLink.pullRequest(key: row.key) {
                            Link(destination: url) { FocusWidgetRow(row: row) }
                        } else {
                            FocusWidgetRow(row: row)
                        }
                    }
                }
            }
            Spacer(minLength: 6)
            HStack(spacing: 6) {
                WidgetPill(text: "\(focus.ready) ready to merge")
                WidgetPill(text: "\(focus.waiting) waiting")
            }
        }
    }
}

struct FocusWidgetRow: View {
    let row: WidgetSnapshot.FocusRow

    var body: some View {
        HStack(spacing: 8) {
            CheckBar(segments: row.segments.isEmpty ? [.neutral] : row.segments, width: 36)
            (Text(verbatim: "#\(row.number) ").fontWeight(.bold) + Text(verbatim: row.title))
                .font(.system(size: 14.5))
                .foregroundStyle(BD.text)
                .lineLimit(1)
            Spacer(minLength: 4)
            Text(row.age)
                .font(.system(size: 13))
                .foregroundStyle(BD.text2)
                .monospacedDigit()
        }
    }
}

struct WidgetPill: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 12.5, weight: .semibold))
            .foregroundStyle(BD.text)
            .padding(.horizontal, 10)
            .frame(height: 26)
            .background(BD.fill2, in: Capsule())
    }
}

struct AgentsWidgetView: View {
    let agents: WidgetSnapshot.Agents

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: "Agents", systemImage: "cpu", tint: BD.text2)
            Spacer(minLength: 4)
            Text("\(agents.waitingOnYou)")
                .font(.system(size: 46, weight: .bold, design: .rounded))
                .foregroundStyle(agents.waitingOnYou > 0 ? BD.red : BD.text)
                .contentTransition(.numericText())
            Text(agents.waitingOnYou == 1 ? "waits on you" : "wait on you")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(BD.text)
            Spacer(minLength: 4)
            HStack(spacing: 6) {
                Circle().fill(BD.blue).frame(width: 6, height: 6)
                Text("\(agents.running) running")
            }
            .font(.system(size: 14))
            .foregroundStyle(BD.text2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct MasterWidgetView: View {
    let master: WidgetSnapshot.Master
    let now: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: "master", systemImage: icon, tint: tint)
            Spacer(minLength: 6)
            switch master.state {
            case .failing:
                Text(master.job ?? "A check fails")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(BD.text)
                    .lineLimit(2)
                Text(failingDetail)
                    .font(.system(size: 13.5))
                    .foregroundStyle(BD.text2)
                    .padding(.top, 2)
                Spacer(minLength: 6)
                if let claimedBy = master.claimedBy {
                    HStack(spacing: 6) {
                        PersonAvatar(name: claimedBy, size: 22)
                        Text("\(claimedBy.split(separator: " ").first.map(String.init) ?? claimedBy) is on it")
                            .font(.system(size: 13.5))
                            .foregroundStyle(BD.text)
                            .lineLimit(1)
                    }
                } else {
                    Text("Nobody claimed it")
                        .font(.system(size: 13.5))
                        .foregroundStyle(BD.text2)
                }
            case .ok:
                Text("All green")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(BD.text)
                Text(master.repo ?? "Your base branches pass")
                    .font(.system(size: 13.5))
                    .foregroundStyle(BD.text2)
                    .lineLimit(2)
                    .padding(.top, 2)
                Spacer(minLength: 0)
            case .unknown:
                Text("Not read yet")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(BD.text)
                Text("Open BorgDock to refresh.")
                    .font(.system(size: 13.5))
                    .foregroundStyle(BD.text2)
                    .padding(.top, 2)
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var icon: String {
        switch master.state {
        case .failing: "xmark.circle"
        case .ok: "checkmark.circle"
        case .unknown: "questionmark.circle"
        }
    }

    private var tint: Color {
        switch master.state {
        case .failing: BD.red
        case .ok: BD.green
        case .unknown: BD.text2
        }
    }

    /// "red 24 min · 3 PRs"
    private var failingDetail: String {
        var parts: [String] = []
        if let since = master.sinceDate { parts.append("red \(WidgetFormat.duration(from: since, to: now))") }
        if master.prsHit > 0 { parts.append(master.prsHit == 1 ? "1 PR" : "\(master.prsHit) PRs") }
        return parts.isEmpty ? "red" : parts.joined(separator: " · ")
    }
}

enum WidgetFormat {
    /// "24 min", "3 h", "2 d".
    static func duration(from start: Date, to end: Date) -> String {
        let minutes = max(0, Int(end.timeIntervalSince(start) / 60))
        if minutes < 60 { return "\(minutes) min" }
        if minutes < 48 * 60 { return "\(minutes / 60) h" }
        return "\(minutes / 1440) d"
    }
}
