import SwiftUI
import WidgetKit

/// Medium: the top three pull requests that need you, each a link to its pull request.
struct FocusWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "dev.borght.borgdock.focus", provider: SnapshotProvider()) { entry in
            FocusWidgetView(snapshot: entry.snapshot)
                .containerBackground(BD.card, for: .widget)
                .widgetURL(BorgDockLink.tab("focus"))
        }
        .configurationDisplayName("Focus")
        .description("The pull requests that need you, first.")
        .supportedFamilies([.systemMedium])
    }
}

/// Small: agents waiting on you, and how many run.
struct AgentsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "dev.borght.borgdock.agents", provider: SnapshotProvider()) { entry in
            AgentsWidgetView(agents: entry.snapshot.agents)
                .containerBackground(BD.card, for: .widget)
                .widgetURL(BorgDockLink.tab("dispatch"))
        }
        .configurationDisplayName("Agents")
        .description("Agents that wait on you, and how many run.")
        .supportedFamilies([.systemSmall])
    }
}

/// Small: master's health. Quiet while it's green, red when it breaks.
struct MasterWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "dev.borght.borgdock.master", provider: SnapshotProvider()) { entry in
            MasterWidgetView(master: entry.snapshot.master, now: entry.date)
                .containerBackground(for: .widget) {
                    ZStack {
                        BD.card
                        if entry.snapshot.master.state == .failing { BD.redSoft }
                    }
                }
                .widgetURL(BorgDockLink.tab("focus"))
        }
        .configurationDisplayName("Master health")
        .description("Turns red when your base branch does.")
        .supportedFamilies([.systemSmall])
    }
}
