import SwiftUI

/// A branch name in the mono face on a soft fill.
struct BranchName: View {
    let name: String
    var size: CGFloat = 13

    var body: some View {
        Text(name)
            .font(.system(size: size, design: .monospaced))
            .foregroundStyle(BD.text2)
            .lineLimit(1)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(BD.fill, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

/// A log excerpt: the location dim, "Expected" green, "Received" red.
struct LogSnippet: View {
    let location: String?
    let text: String
    var background: Color = BD.fill

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            if let location { Text(location).foregroundStyle(BD.text3) }
            ForEach(Array(text.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                Text(line).foregroundStyle(LogSnippet.color(line)).fixedSize(horizontal: false, vertical: true)
            }
        }
        .font(.system(size: 12.5, design: .monospaced))
        .lineSpacing(2)
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    static func color(_ line: String) -> Color {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("Expected") || trimmed.hasPrefix("+ ") { return BD.green }
        if trimmed.hasPrefix("Received") || trimmed.hasPrefix("- ") { return BD.red }
        return BD.text
    }
}

/// Rows in one card with inset separators, like a grouped table section.
struct PrGroupCard<Content: View>: View {
    var indent: CGFloat = 16
    var fill: Color = BD.card
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 0) {
            Group(subviews: content) { subviews in
                ForEach(Array(subviews.enumerated()), id: \.offset) { index, subview in
                    subview
                    if index < subviews.count - 1 { Rectangle().fill(BD.separator).frame(height: 0.5).padding(.leading, indent) }
                }
            }
        }
        .bdCard(fill: fill)
    }
}

/// "Reviews", "Work item": the small header above a card.
struct PrSectionLabel: View {
    let title: String
    var trailing: String?

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            if let trailing { Text(trailing) }
        }
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(BD.text2)
        .padding(.horizontal, 24)
        .padding(.top, 18)
        .padding(.bottom, 8)
    }
}

/// A person's avatar by name; "You" uses the accent.
struct PersonBadge: View {
    let person: Person
    var size: CGFloat = 32

    var body: some View {
        PersonAvatar(name: person.displayName, size: size)
    }
}

extension PrReviewState {
    var chip: PrChip {
        switch self {
        case .approved: PrChip(text: "Approved", style: .tone(.ok), systemImage: "checkmark")
        case .changesRequested: PrChip(text: "Changes requested", style: .tone(.bad), systemImage: "xmark")
        case .commented: PrChip(text: "Commented", style: .tone(.mute))
        case .dismissed: PrChip(text: "Dismissed", style: .tone(.mute))
        case .pending: PrChip(text: "Pending", style: .tone(.warn))
        }
    }
}

extension ReactionContent {
    static func emoji(_ content: String) -> String {
        switch content.uppercased() {
        case "THUMBS_UP", "+1": "👍"
        case "THUMBS_DOWN", "-1": "👎"
        case "LAUGH": "😄"
        case "HOORAY": "🎉"
        case "CONFUSED": "😕"
        case "HEART": "❤️"
        case "ROCKET": "🚀"
        case "EYES": "👀"
        default: content
        }
    }
}

enum ReactionContent {}

/// The common folder of some paths, so lists can show "derive/github.ts" instead of the full path.
enum PathPrefix {
    static func common(_ paths: [String]) -> String {
        guard var prefix = paths.first?.splitPath.folder else { return "" }
        for path in paths.dropFirst() {
            while !prefix.isEmpty, !path.hasPrefix(prefix) {
                let trimmed = prefix.dropLast()
                prefix = trimmed.lastIndex(of: "/").map { String(trimmed[...$0]) } ?? ""
            }
        }
        return prefix
    }
}
