import SwiftUI

/// The linked BorgDock desktop apps with Link a desktop, in Connect your work and Settings. Tapping a desktop
/// offers to unlink it, which signs its session out.
struct DesktopsGroup: View {
    let title: String
    let desktops: [LinkedDesktop]
    let link: () -> Void

    @Environment(AppModel.self) private var app
    @State private var unlinking: LinkedDesktop?

    var body: some View {
        CellGroupHeader(title: title)
        CellGroup(indent: 66) {
            ForEach(desktops) { desktop in
                Button { unlinking = desktop } label: {
                    DesktopCell(desktop: desktop)
                }
                .buttonStyle(.plain)
                .accessibilityHint("Offers to unlink it")
            }
            Button(action: link) {
                if desktops.isEmpty {
                    Cell(title: "Not signed in", subtitle: "Shares read state and when you're at your desk", chevron: true) {
                        BDAppTile(size: 36)
                    }
                } else {
                    Cell(title: "Link a desktop", chevron: true, titleColor: BD.accentText) {
                        IconTile(systemImage: "plus", background: BD.accentSoft, foreground: BD.accentText)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("link-desktop")
        }
        .confirmationDialog(
            "Unlink \(unlinking?.name ?? "this desktop")?",
            isPresented: Binding(get: { unlinking != nil }, set: { if !$0 { unlinking = nil } }),
            titleVisibility: .visible,
            presenting: unlinking
        ) { desktop in
            Button("Unlink", role: .destructive) { Task { await app.account.unlinkDesktop(desktop) } }
        } message: { _ in
            Text("It stops sharing read state and when you're at your desk. Link it again with a new code.")
        }
    }
}

struct DesktopCell: View {
    let desktop: LinkedDesktop

    var body: some View {
        Cell(title: desktop.name, subtitle: desktop.statusLine(), leading: {
            BDAppTile(size: 36)
        }, trailing: {
            if desktop.atDesk { Circle().fill(BD.green).frame(width: 9, height: 9).accessibilityLabel("At your desk") }
        })
    }
}

extension LinkedDesktop {
    /// "At your desk", "Away · seen 2 h ago", "Linked · not seen yet".
    func statusLine(now: Date = .now) -> String {
        if atDesk { return "At your desk" }
        guard let lastSeenAt else { return "Linked · not seen yet" }
        let ago = CompactTime.ago(lastSeenAt, now: now)
        return ago == "now" ? "Away · seen just now" : "Away · seen \(ago) ago"
    }
}
