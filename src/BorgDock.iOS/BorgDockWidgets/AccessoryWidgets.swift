import SwiftUI
import WidgetKit

// Lock screen accessories, under the clock: pull requests that need you, agents, master, and a quick note.

struct NeedYouAccessory: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "dev.borght.borgdock.accessory.needyou", provider: SnapshotProvider()) { entry in
            NeedYouAccessoryView(focus: entry.snapshot.focus)
                .containerBackground(.clear, for: .widget)
                .widgetURL(BorgDockLink.tab("focus"))
        }
        .configurationDisplayName("Need you")
        .description("How many pull requests need you.")
        .supportedFamilies([.accessoryCircular, .accessoryInline])
    }
}

struct AgentsAccessory: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "dev.borght.borgdock.accessory.agents", provider: SnapshotProvider()) { entry in
            AgentsAccessoryView(agents: entry.snapshot.agents)
                .containerBackground(.clear, for: .widget)
                .widgetURL(BorgDockLink.tab("dispatch"))
        }
        .configurationDisplayName("Agents")
        .description("Agents that wait on you.")
        .supportedFamilies([.accessoryRectangular])
    }
}

struct MasterAccessory: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "dev.borght.borgdock.accessory.master", provider: SnapshotProvider()) { entry in
            MasterAccessoryView(master: entry.snapshot.master)
                .containerBackground(.clear, for: .widget)
                .widgetURL(BorgDockLink.tab("focus"))
        }
        .configurationDisplayName("Master")
        .description("Your base branch's checks.")
        .supportedFamilies([.accessoryCircular])
    }
}

struct QuickNoteAccessory: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "dev.borght.borgdock.accessory.quicknote", provider: SnapshotProvider()) { _ in
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "square.and.pencil").font(.system(size: 20, weight: .medium))
            }
            .widgetAccentable()
            .containerBackground(.clear, for: .widget)
            .widgetURL(BorgDockLink.capture)
            .accessibilityLabel("Quick note")
        }
        .configurationDisplayName("Quick note")
        .description("Write into today's note.")
        .supportedFamilies([.accessoryCircular])
    }
}

/// Control Center (and the lock screen's controls): opens the quick note sheet.
struct QuickNoteControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "dev.borght.borgdock.control.quicknote") {
            ControlWidgetButton(action: QuickNoteIntent()) {
                Label("Quick note", systemImage: "square.and.pencil")
            }
        }
        .displayName("Quick note")
        .description("Write into today's BorgDock note.")
    }
}
