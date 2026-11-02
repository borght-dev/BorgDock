import SwiftUI
import WidgetKit

// Views shared by the widget extension and the app (the app renders them in its DEBUG gallery for screenshots).

struct NeedYouAccessoryView: View {
    @Environment(\.widgetFamily) private var family
    let focus: WidgetSnapshot.Focus

    var body: some View {
        switch family {
        case .accessoryInline:
            Label("\(focus.needYou) need you", systemImage: "scope")
        default:
            let total = max(focus.needYou + focus.ready + focus.waiting, 1)
            Gauge(value: Double(focus.needYou), in: 0...Double(total)) {
                Text("PRs")
            } currentValueLabel: {
                VStack(spacing: -2) {
                    Text("\(focus.needYou)").font(.system(size: 22, weight: .bold, design: .rounded))
                    Text("need you").font(.system(size: 8, weight: .medium))
                }
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .widgetAccentable()
        }
    }
}

struct AgentsAccessoryView: View {
    let agents: WidgetSnapshot.Agents

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                BDMark().frame(width: 11, height: 11)
                Text("Agents")
            }
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(.secondary)
            .widgetAccentable()
            Text(agents.waitingOnYou == 1 ? "1 waits on you" : "\(agents.waitingOnYou) wait on you")
                .font(.system(size: 16, weight: .bold))
            Text("\(agents.running) running")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct MasterAccessoryView: View {
    let master: WidgetSnapshot.Master

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 2) {
                Image(systemName: icon).font(.system(size: 20, weight: .medium))
                Text("master").font(.system(size: 10, weight: .medium))
            }
        }
        .widgetAccentable()
        .accessibilityLabel(master.state == .failing ? "master is red" : master.state == .ok ? "master is green" : "master not read")
    }

    private var icon: String {
        switch master.state {
        case .failing: "xmark.circle"
        case .ok: "checkmark.circle"
        case .unknown: "questionmark.circle"
        }
    }
}
