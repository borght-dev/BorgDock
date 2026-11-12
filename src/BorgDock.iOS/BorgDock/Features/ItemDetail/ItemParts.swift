import SwiftUI

/// "QA notes                Lena · 1 d": the small label over a section.
struct ItemSectionLabel: View {
    let title: String
    var trailing: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).foregroundStyle(BD.text2)
            Spacer(minLength: 8)
            if let trailing { Text(trailing).fontWeight(.medium).foregroundStyle(BD.text3).monospacedDigit() }
        }
        .font(.system(size: 13, weight: .semibold))
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .padding(.bottom, 8)
    }
}

/// The workflow as segments with tiny labels under them, and the history line.
struct WorkflowTrackView: View {
    let track: WorkflowTrack

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 3) {
                ForEach(Array(track.steps.enumerated()), id: \.offset) { _, step in
                    Capsule().fill(color(step.mark, fill: true)).frame(height: 5)
                }
            }
            HStack(spacing: 3) {
                ForEach(Array(track.steps.enumerated()), id: \.offset) { _, step in
                    Text(step.label)
                        .font(.system(size: 10.5, weight: step.mark == .todo || step.mark == .done ? .regular : .semibold))
                        .foregroundStyle(color(step.mark, fill: false))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.top, 6)
            if let note = track.note {
                Text(note).font(.system(size: 13)).foregroundStyle(BD.text2).padding(.top, 5)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func color(_ mark: WorkflowTrack.Mark, fill: Bool) -> Color {
        switch mark {
        case .done: fill ? BD.accent : BD.text3
        case .current: fill ? BD.accent : BD.text
        case .failed: BD.red
        case .held: BD.yellow
        case .todo: fill ? BD.fill2 : BD.text3
        }
    }
}

/// ADO rich text in a card: markdown through `GitHubMarkdown`, attachment images as their own cards.
struct RichTextCard: View {
    let markdown: String
    var attachments: [ItemAttachment] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(RichText.blocks(markdown).enumerated()), id: \.offset) { _, block in
                switch block {
                case .markdown(let text): GitHubMarkdown(text, size: 14.5).frame(maxWidth: .infinity, alignment: .leading)
                case .image(let alt, let url): AttachmentImage(alt: alt, url: url, attachment: attachments.first { $0.url == url })
                }
            }
        }
        .textSelection(.enabled)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .bdCard(radius: 20)
        .padding(.horizontal, 16)
    }
}

/// A screenshot from ADO, loaded through the server's signed URL: the image, then its name and size.
struct AttachmentImage: View {
    @Environment(AppModel.self) private var app
    let alt: String
    let url: String
    let attachment: ItemAttachment?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            AsyncImage(url: app.api.resolve(url)) { phase in
                switch phase {
                case .success(let image): image.resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                case .failure: Label("Couldn't load the image", systemImage: "photo").font(.system(size: 13)).foregroundStyle(BD.text3).frame(height: 60)
                default: ProgressView().frame(maxWidth: .infinity).frame(height: 90)
                }
            }
            .frame(maxWidth: .infinity)
            HStack {
                Text(attachment?.name ?? (alt.isEmpty ? "Image" : alt)).fontWeight(.medium).foregroundStyle(BD.text2).lineLimit(1)
                Spacer(minLength: 8)
                if let size = attachment?.size { Text(size.formatted(.byteCount(style: .binary))).foregroundStyle(BD.text3) }
            }
            .font(.system(size: 11.5))
        }
        .padding(10)
        .background(BD.card2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(BD.separator, lineWidth: 0.5))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(attachment?.name ?? alt)
    }
}

/// A linked pull request: "shop #412 · Priya   4 d", its title and where it is stuck. A shared one (an epic's plan on
/// every PBI) is one compact line.
struct ItemPullRequestRow: View {
    @Environment(AppModel.self) private var app
    let pr: ItemPullRequest

    var body: some View {
        if pr.shared { compact } else { full }
    }

    private var full: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                Text(ItemPullRequestTrack.repositoryName(pr)).fontWeight(.semibold).foregroundStyle(BD.text)
                Text(verbatim: "#\(pr.number)" + (pr.author.map { " · \(CommentAuthor.displayName($0).name)" } ?? ""))
                Spacer(minLength: 8)
                Text(ShortTime.age(pr.updatedAt))
            }
            .font(.system(size: 13))
            .foregroundStyle(BD.text2)
            .lineLimit(1)
            Text(pr.title)
                .font(.system(size: 15.5, weight: .semibold))
                .tracking(-0.2)
                .foregroundStyle(BD.text)
                .lineLimit(1)
                .padding(.top, 3)
            PrTrackView(steps: summary?.track ?? ItemPullRequestTrack.steps(pr)).padding(.top, 7)
        }
        .padding(.horizontal, 14)
        .padding(.top, 11)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var compact: some View {
        HStack(spacing: 5) {
            Text(ItemPullRequestTrack.repositoryName(pr)).fontWeight(.semibold).foregroundStyle(BD.text)
            Text(verbatim: "#\(pr.number)")
            ToneChip(text: "Shared", small: true).padding(.leading, 4)
            Spacer(minLength: 8)
            Text(pr.title).lineLimit(1)
        }
        .font(.system(size: 13))
        .foregroundStyle(BD.text2)
        .padding(.horizontal, 14)
        .padding(.top, 9)
        .padding(.bottom, 10)
        .contentShape(Rectangle())
    }

    /// Focus's own read of the pull request, with its checks and reviews, when it has one.
    private var summary: PrSummary? {
        app.focus.focus?.pullRequests.first { $0.url.caseInsensitiveCompare(pr.url) == .orderedSame }
    }
}

/// The details grid: two columns on hairlines, wide cells across both.
struct ItemDetailsGrid: View {
    let cells: [ItemDetailCell]
    let onParent: (ItemParent) -> Void

    var body: some View {
        let rows = ItemDetailCell.rows(cells)
        VStack(spacing: 0.5) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 0.5) {
                    ForEach(row) { cell in content(cell) }
                }
            }
        }
        .background(BD.separator)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private func content(_ cell: ItemDetailCell) -> some View {
        let body = VStack(alignment: .leading, spacing: 1) {
            Text(cell.label).font(.system(size: 12)).foregroundStyle(BD.text3)
            value(cell.value)
                .font(.system(size: 14.5, weight: .medium))
                .foregroundStyle(BD.text)
                .lineLimit(1)
                .frame(minHeight: 22)
        }
        .padding(.horizontal, 14)
        .padding(.top, 9)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BD.card)
        if case .parent(let parent) = cell.value {
            Button { onParent(parent) } label: { body.contentShape(Rectangle()) }.buttonStyle(.plain)
        } else {
            body
        }
    }

    @ViewBuilder
    private func value(_ value: ItemDetailCell.Value) -> some View {
        switch value {
        case .text(let text):
            Text(text)
        case .person(let name, let isYou):
            HStack(spacing: 6) {
                if isYou { YouAvatar(name: name, size: 20) } else { PersonAvatar(name: name, size: 20) }
                Text(isYou ? "You" : name)
            }
        case .parent(let parent):
            HStack(spacing: 6) {
                WorkItemGlyph(typeName: parent.typeName, size: 11)
                Text(verbatim: "AB#\(parent.id) \(parent.title)")
            }
        case .tags(let tags):
            HStack(spacing: 5) {
                ForEach(tags, id: \.self) { ToneChip(text: $0, small: true) }
            }
        }
    }
}

/// One entry in Activity: a comment as a card (Vera's with her shield and the report's kind), a change as a line.
struct ActivityEntryView: View {
    let entry: ItemActivity.Entry
    let me: String?

    var body: some View {
        switch entry {
        case .comment(let comment, let author): commentCard(comment, author)
        case .event(let event): eventLine(event)
        }
    }

    private func commentCard(_ comment: ItemComment, _ author: CommentAuthor) -> some View {
        HStack(alignment: .top, spacing: 10) {
            avatar(author, by: comment.by)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(author.name).font(.system(size: 14.5, weight: .semibold)).foregroundStyle(BD.text)
                    if let kind = author.veraKind {
                        Text(kind)
                            .font(.system(size: 12.5))
                            .foregroundStyle(BD.merged)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(BD.mergedSoft, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                            .alignmentGuide(.firstTextBaseline) { $0[.firstTextBaseline] }
                    }
                    Text([author.role, CompactTime.ago(comment.at)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.system(size: 12.5))
                        .foregroundStyle(BD.text3)
                }
                GitHubMarkdown(author.body, size: 14).frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 11)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .bdCard(radius: 20)
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    @ViewBuilder
    private func avatar(_ author: CommentAuthor, by: String) -> some View {
        if author.veraKind != nil {
            Image(systemName: "checkmark.shield")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 30, height: 30)
                .background(BD.merged, in: Circle())
        } else if author.isYou {
            YouAvatar(name: by, size: 30)
        } else {
            PersonAvatar(name: author.name, size: 30)
        }
    }

    private func eventLine(_ event: ItemHistoryEvent) -> some View {
        HStack(spacing: 10) {
            Circle().fill(ItemActivity.hue(event).color).frame(width: 7, height: 7)
            Text("\(Text(ItemActivity.title(event, me: me)).foregroundStyle(BD.text).fontWeight(.medium))\(Text(" · \(ItemActivity.actor(event, me: me))").foregroundStyle(BD.text2))")
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(CompactTime.ago(event.at)).font(.system(size: 12)).foregroundStyle(BD.text3)
        }
        .font(.system(size: 13))
        .padding(.leading, 14)
        .padding(.trailing, 4)
        .padding(.vertical, 8)
        .padding(.horizontal, 16)
        .padding(.bottom, 2)
    }
}

/// Your own avatar: your initials on BorgDock's indigo, as the mockups draw "You".
struct YouAvatar: View {
    let name: String
    var size: CGFloat = 20

    var body: some View {
        Text(PersonAvatar.initials(name))
            .font(.system(size: size * 0.38, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(LinearGradient(colors: [Color(hex: 0x7F7EFF), Color(hex: 0x4F46E5)], startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
            .accessibilityHidden(true)
    }
}
