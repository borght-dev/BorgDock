import SwiftUI

extension LedgerTone {
    /// The row's edge.
    var color: Color {
        switch self {
        case .review: BD.accent
        case .attention: BD.yellow
        case .failing: BD.red
        case .ready: BD.green
        case .merged: BD.merged
        }
    }

    /// The reason's words: the accent has its own, darker text colour.
    var textColor: Color { self == .review ? BD.accentText : color }
}

/// One pull request in the Ledger: 50 points, two lines, the same parts in the same places on every row. The title is
/// the only text a row cuts; a second line that runs out of room drops the work item whole, never the reason.
struct LedgerRowView: View {
    let row: LedgerRow
    let now: Date
    /// The first work item's type once Azure DevOps answered: its colour marks the AB# reference.
    var workItemType: String?
    /// While an approval of it waits out its Undo, and while the list on screen is old.
    var faded = false
    /// A row that can merge trades its right column for the button.
    var merge: (() -> Void)?
    let open: () -> Void

    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .body) private var titleSize: CGFloat = 14.5
    @ScaledMetric(relativeTo: .footnote) private var lineSize: CGFloat = 12

    private var roomy: Bool { typeSize > .large }

    var body: some View {
        HStack(spacing: 10) {
            Button(action: open) {
                HStack(spacing: 10) {
                    LedgerAvatar(person: row.pr.author, mine: row.mine)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.pr.title)
                            .font(.system(size: titleSize, weight: .semibold))
                            .tracking(-0.17)
                            .foregroundStyle(BD.text)
                            .lineLimit(roomy ? 2 : 1)
                        secondLine
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if merge == nil { columns }
                }
                .frame(maxHeight: .infinity)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(spoken)
            .accessibilityAddTraits(.isButton)
            if let merge {
                Button(action: merge) {
                    Text("Merge")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(BD.onGreen)
                        .padding(.horizontal, 14)
                        .frame(height: 32)
                        .background(BD.green, in: Capsule())
                        // A 44 point target that takes the room of the 32 point button, so the row stays 50 high.
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                        .padding(.vertical, -6)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Merge #\(row.pr.number)")
                .accessibilityIdentifier("ledger-merge-\(row.pr.key)")
            }
        }
        .padding(EdgeInsets(top: 7, leading: 14, bottom: 8, trailing: 16))
        .frame(minHeight: 50)
        .opacity(faded ? 0.45 : 1)
        .overlay(alignment: .leading) { Rectangle().fill(row.edge?.color ?? .clear).frame(width: 3) }
    }

    /// Reason, repository and number, work item.
    private var secondLine: some View {
        ViewThatFits(in: .horizontal) {
            line(workItem: true)
            line(workItem: false)
        }
        .font(.system(size: lineSize))
        .foregroundStyle(BD.text2)
        .frame(height: lineSize + 4)
    }

    private func line(workItem: Bool) -> some View {
        HStack(spacing: 0) {
            Text(row.reason.text)
                .fontWeight(.semibold)
                .foregroundStyle(row.reasonTone?.textColor ?? BD.text2)
                .fixedSize()
                .layoutPriority(2)
            Text(verbatim: " · \(row.pr.repo) #\(row.pr.number)").layoutPriority(1)
            if workItem, let id = row.pr.workItemIds.first {
                Text(verbatim: " · ")
                RoundedRectangle(cornerRadius: 2)
                    .fill(workItemType.map(WorkItemGlyph.color) ?? BD.text3)
                    .frame(width: 7, height: 7)
                    .padding(.trailing, 4)
                Text(verbatim: "AB#\(id)" + (row.pr.workItemIds.count > 1 ? " +\(row.pr.workItemIds.count - 1)" : ""))
            }
        }
        .lineLimit(1)
    }

    /// Checks and age on the title's line, size under them. Large text drops the size first.
    private var columns: some View {
        VStack(alignment: .trailing, spacing: 7) {
            HStack(spacing: 6) {
                LedgerCheckBar(checks: row.pr.checks)
                Text(LedgerAge.text(since: row.since, now: now))
                    .font(.system(size: lineSize, weight: old ? .semibold : .regular))
                    .monospacedDigit()
                    .foregroundStyle(old ? BD.yellow : BD.text2)
                    .lineLimit(1)
                    .fixedSize()
                    .frame(minWidth: 32, alignment: .trailing)
            }
            if !roomy {
                HStack(spacing: 5) {
                    Text(verbatim: "+" + DiffStat.compact(row.pr.additions)).foregroundStyle(BD.green)
                    Text(verbatim: "−" + DiffStat.compact(row.pr.deletions)).foregroundStyle(BD.red)
                }
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .lineLimit(1)
                .fixedSize()
            }
        }
        .fixedSize()
    }

    private var old: Bool { LedgerAge.isOld(since: row.since, now: now) }

    private var spoken: String {
        var parts = [row.pr.title, row.reason.text, "\(row.pr.repo) number \(row.pr.number)"]
        if merge == nil {
            parts.append(LedgerChecks.summary(row.pr.checks))
            let age = LedgerAge.text(since: row.since, now: now)
            if !age.isEmpty { parts.append(age) }
        }
        return parts.joined(separator: ", ")
    }
}

/// The check bar of a row: 40 by 4 points, one part per state. A repository without checks says so.
struct LedgerCheckBar: View {
    let checks: CheckSummary

    var body: some View {
        let parts = LedgerChecks.parts(checks)
        if parts.isEmpty {
            Text("no checks").font(.system(size: 10.5)).foregroundStyle(BD.text3).lineLimit(1).fixedSize()
        } else {
            HStack(spacing: 2) {
                ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                    Capsule()
                        .fill(part.state.color)
                        .opacity(part.state == .skipped || part.state == .neutral ? 0.5 : 1)
                        .frame(width: part.width, height: 4)
                }
            }
            .frame(width: 40, alignment: .leading)
            .accessibilityHidden(true)
        }
    }
}

/// Who wrote it: initials on the person's colour, your own on BorgDock's indigo, a package for a dependency bot.
struct LedgerAvatar: View {
    let person: Person
    let mine: Bool
    var size: CGFloat = 22

    var body: some View {
        Group {
            if DependencyBot.isBot(person.login) {
                Image(systemName: "shippingbox.fill")
                    .font(.system(size: size * 0.45, weight: .semibold))
                    .foregroundStyle(BD.text2)
                    .frame(width: size, height: size)
                    .background(BD.fill2, in: Circle())
            } else if mine {
                Text(PersonAvatar.initials(person.displayName))
                    .font(.system(size: size * 0.4, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: size, height: size)
                    .background(LinearGradient(colors: [BD.brandIndigo, Color(hex: 0x4F46E5)], startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
            } else {
                PersonAvatar(name: person.displayName, size: size)
            }
        }
        .accessibilityHidden(true)
    }
}

/// A row that is still being read: grey bars where its parts will be.
struct LedgerSkeletonRow: View {
    var titleWidth: CGFloat = 170

    var body: some View {
        HStack(spacing: 10) {
            Circle().fill(BD.fill2).frame(width: 22, height: 22)
            VStack(alignment: .leading, spacing: 9) {
                Capsule().fill(BD.fill2).frame(width: titleWidth, height: 9)
                Capsule().fill(BD.fill).frame(width: titleWidth * 0.62, height: 9)
            }
            Spacer(minLength: 8)
            Capsule().fill(BD.fill2).frame(width: 40, height: 5)
        }
        .padding(EdgeInsets(top: 7, leading: 14, bottom: 8, trailing: 16))
        .frame(minHeight: 50)
        .accessibilityHidden(true)
    }
}
