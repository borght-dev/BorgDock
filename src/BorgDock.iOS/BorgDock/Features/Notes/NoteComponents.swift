import SwiftUI

/// Lays out words and chips left to right, centred on each line, and wraps them, so a reference chip sits inline
/// in a sentence. Unlike `FlowLayout` it adds no gap: each word carries its own trailing space.
struct InlineFlow: Layout {
    var lineSpacing: CGFloat = 5

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = rows(width: proposal.width ?? .infinity, subviews: subviews)
        let height = rows.reduce(0) { $0 + $1.height } + lineSpacing * CGFloat(max(rows.count - 1, 0))
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in rows(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for (index, size) in zip(row.indices, row.sizes) {
                subviews[index].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2), proposal: ProposedViewSize(size))
                x += size.width
            }
            y += row.height + lineSpacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var sizes: [CGSize] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func rows(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var row = Row()
        for index in subviews.indices {
            var size = subviews[index].sizeThatFits(.unspecified)
            if size.width > width {
                size = subviews[index].sizeThatFits(ProposedViewSize(width: width, height: nil))
            }
            if row.width + size.width > width + 0.5, !row.indices.isEmpty {
                rows.append(row)
                row = Row()
            }
            row.indices.append(index)
            row.sizes.append(size)
            row.width += size.width
            row.height = max(row.height, size.height)
        }
        if !row.indices.isEmpty { rows.append(row) }
        return rows
    }
}

/// A reference as a chip with its live state: "shop#3712 · 2 failing", "AB#61044 · Your turn".
struct RefChip: View {
    let ref: NoteRef
    let resolved: ResolvedRef?
    var size: CGFloat = 15.5
    var muted = false

    var body: some View {
        HStack(spacing: 5) {
            icon
            Text(label).lineLimit(1)
        }
        .font(.system(size: size, weight: .semibold))
        .foregroundStyle(muted ? BD.text3 : BD.text)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(BD.fill2, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .padding(.horizontal, 2)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isLink)
    }

    private var label: String {
        guard let resolved else { return ref.display }
        switch ref {
        case .thread, .workstream:
            return resolved.title
        default:
            return resolved.tone == .bad || resolved.tone == .warn ? "\(ref.display) · \(resolved.state)" : ref.display
        }
    }

    @ViewBuilder private var icon: some View {
        let tone = resolved?.tone ?? .mute
        switch ref {
        case .pullRequest:
            if resolved?.state.lowercased() == "merged" {
                Image(systemName: "arrow.triangle.merge").foregroundStyle(BD.merged)
            } else if tone == .bad {
                Image(systemName: "xmark").foregroundStyle(BD.red)
            } else {
                Image(systemName: "arrow.triangle.pull").foregroundStyle(muted ? BD.text3 : tone == .mute ? BD.text2 : tone.color)
            }
        case .item:
            Circle().fill(muted ? BD.text3 : tone == .mute ? BD.pbi : tone.color).frame(width: 8, height: 8)
        case .thread:
            Image(systemName: "bubble.left.and.text.bubble.right").foregroundStyle(BD.accent)
        case .workstream:
            Image(systemName: "target").foregroundStyle(BD.accent)
        }
    }
}

/// One line of note text: Markdown emphasis, references as live chips, `[[links]]` and URLs as links.
struct NoteInlineText: View {
    @Environment(AppModel.self) private var app
    @Environment(\.openURL) private var openURL
    let text: String
    var size: CGFloat = 17.5
    var color: Color = BD.text
    /// A ticked task: struck through and quiet.
    var done = false
    var openNote: (String) -> Void = { _ in }

    var body: some View {
        InlineFlow(lineSpacing: 5) {
            ForEach(Array(NoteText.spans(text).enumerated()), id: \.offset) { _, span in
                switch span {
                case .text(let markdown):
                    ForEach(Array(Self.words(markdown).enumerated()), id: \.offset) { _, word in
                        Text(word).font(.system(size: size)).foregroundStyle(done ? BD.text3 : color).strikethrough(done)
                    }
                case .ref(let ref):
                    Button { open(ref) } label: {
                        RefChip(ref: ref, resolved: ref.resolveKey.flatMap { app.notes.resolved[$0] }, size: size - 2, muted: done)
                    }
                    .buttonStyle(.plain)
                case .wikilink(let target, let label):
                    linkWords(label ?? target) { openNote(target) }
                case .link(let url, let label):
                    linkWords(label) { openURL(url) }
                }
            }
        }
    }

    private func linkWords(_ label: String, action: @escaping () -> Void) -> some View {
        ForEach(Array(Self.words(label).enumerated()), id: \.offset) { _, word in
            Button(action: action) {
                Text(word).font(.system(size: size)).foregroundStyle(done ? BD.text3 : BD.accentText).strikethrough(done)
            }
            .buttonStyle(.plain)
        }
    }

    private func open(_ ref: NoteRef) {
        switch ref {
        case .item(let id): app.router.push(.workItem(ItemRoute(id: id)))
        case .pullRequest(let owner?, let repo, let number): app.router.push(.pullRequest(PrKey(owner: owner, repo: repo, number: number)))
        case .pullRequest(nil, _, _):
            if let key = ref.resolveKey, let url = app.notes.resolved[key]?.url.flatMap(URL.init(string:)),
               let pr = Self.prKey(fromGitHub: url) {
                app.router.push(.pullRequest(pr))
            }
        case .thread(_, let threadId, _): app.router.push(.thread(threadId))
        case .workstream(let id, _): app.router.push(.workstream(id))
        }
    }

    /// https://github.com/owner/repo/pull/12 → owner/repo#12.
    static func prKey(fromGitHub url: URL) -> PrKey? {
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count >= 4, parts[2] == "pull", let number = Int(parts[3]) else { return nil }
        return PrKey(owner: parts[0], repo: parts[1], number: number)
    }

    /// Markdown inline text split into words that keep their emphasis and their trailing space.
    static func words(_ markdown: String) -> [AttributedString] {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        let attributed = (try? AttributedString(markdown: markdown, options: options)) ?? AttributedString(markdown)
        let plain = String(attributed.characters)
        var words: [AttributedString] = []
        for match in plain.matches(of: /\S+\s*|\s+/) {
            let lower = plain.distance(from: plain.startIndex, to: match.range.lowerBound)
            let upper = plain.distance(from: plain.startIndex, to: match.range.upperBound)
            let start = attributed.characters.index(attributed.startIndex, offsetBy: lower)
            let end = attributed.characters.index(attributed.startIndex, offsetBy: upper)
            words.append(AttributedString(attributed[start..<end]))
        }
        return words
    }
}

/// The round-cornered checkbox in front of a task.
struct TaskCheckbox: View {
    let done: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .fill(done ? BD.accent : Color.clear)
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .strokeBorder(done ? BD.accent : BD.text3, lineWidth: 1.5)
            if done {
                Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
            }
        }
        .frame(width: 26, height: 26)
    }
}
