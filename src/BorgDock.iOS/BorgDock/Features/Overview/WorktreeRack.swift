import SwiftUI

/// Worktrees by host, with the latest known occupancy.
struct WorktreeRack: View {
    let worktrees: [Worktree]
    let onOpenItem: (Int) -> Void

    private var environments: [String] { worktrees.reduce(into: []) { ids, worktree in
        let id = worktree.environmentId ?? ""
        if !ids.contains(id) { ids.append(id) }
    } }

    var body: some View {
        VStack(spacing: 6) {
            ForEach(environments, id: \.self) { environment in
                let group = worktrees.filter { ($0.environmentId ?? "") == environment }
                HStack(spacing: 6) {
                    if let label = group.first?.environmentLabel {
                        Text(label).font(.caption2).foregroundStyle(Palette.muted)
                            .lineLimit(1).minimumScaleFactor(0.8)
                            .frame(width: 58, alignment: .leading)
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(group) { worktree in
                                if let itemId = worktree.itemId, worktree.state == .mine {
                                    Button { onOpenItem(itemId) } label: { WorktreeChip(worktree: worktree) }
                                        .buttonStyle(.plain)
                                } else {
                                    WorktreeChip(worktree: worktree)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 18)
            }
        }
    }
}

private struct WorktreeChip: View {
    let worktree: Worktree

    private var isFree: Bool { worktree.canStart }

    private var subtitle: String {
        if worktree.available == false { return "offline" }
        return switch worktree.state {
        case .free: "free"
        case .mine: worktree.itemId.map(String.init) ?? "busy"
        case .busy: worktree.itemId.map(String.init) ?? "busy"
        }
    }

    var body: some View {
        VStack(spacing: 4) {
            Text(worktree.name)
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(isFree ? Palette.inkGreen : Palette.text)
            Text(subtitle)
                .appFont(9, weight: .regular, relativeTo: .caption2)
                .foregroundStyle(worktree.needsYou ? Palette.needsYouText : isFree ? Palette.inkGreen : Palette.muted)
                .lineLimit(1)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 6)
        .frame(minWidth: 49)
        .background(worktree.needsYou ? Color(hex: 0xFCF3F0) : Palette.paper, in: RoundedRectangle(cornerRadius: 5))
        .overlay {
            RoundedRectangle(cornerRadius: 5)
                .strokeBorder(worktree.needsYou ? Color(hex: 0xDEC6BF) : Palette.line,
                              style: StrokeStyle(lineWidth: 1, dash: isFree ? [4, 3] : []))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(worktree.available == false ? "\(worktree.name), offline, last known activity" : accessibilityText)
    }

    private var accessibilityText: String {
        switch worktree.state {
        case .free: "\(worktree.name), free"
        case .mine: "\(worktree.name), \(subtitle)\(worktree.needsYou ? ", needs you" : worktree.running ? ", running" : "")"
        case .busy: "\(worktree.name), \(subtitle)"
        }
    }
}
