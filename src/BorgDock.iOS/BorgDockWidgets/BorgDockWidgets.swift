import SwiftUI
import WidgetKit

/// Widgets, Live Activities and the Quick note control. Every widget reads the snapshot the app writes to the
/// App Group (`WidgetSnapshotStore`); the app reloads the timelines after it writes a new one.
@main
struct BorgDockWidgetBundle: WidgetBundle {
    var body: some Widget {
        FocusWidget()
        AgentsWidget()
        MasterWidget()
        NeedYouAccessory()
        AgentsAccessory()
        MasterAccessory()
        QuickNoteAccessory()
        AgentLiveActivity()
        ChecksLiveActivity()
        ApprovalLiveActivityWidget()
        QuickNoteControl()
    }
}

struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
    /// No snapshot on disk yet: the app hasn't read the server since it was installed or signed in.
    let isPlaceholder: Bool
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry {
        SnapshotEntry(date: .now, snapshot: .placeholder, isPlaceholder: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(entry(preview: context.isPreview))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        // The app reloads timelines whenever it writes a snapshot; the half-hour refresh only keeps ages honest.
        completion(Timeline(entries: [entry(preview: false)], policy: .after(.now.addingTimeInterval(30 * 60))))
    }

    private func entry(preview: Bool) -> SnapshotEntry {
        if let stored = WidgetSnapshotStore().load() {
            return SnapshotEntry(date: .now, snapshot: stored, isPlaceholder: false)
        }
        return SnapshotEntry(date: .now, snapshot: .placeholder, isPlaceholder: !preview)
    }
}
