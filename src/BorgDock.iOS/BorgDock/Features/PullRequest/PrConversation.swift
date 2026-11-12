import SwiftUI

/// Review threads with the lines they were left on, then the conversation (comments and review summaries), then the
/// resolved threads, folded. Every body renders through `GitHubMarkdown`; a bot's summary or long comment folds to a row.
struct PrCommentsSection: View {
    @Environment(AppModel.self) private var app
    let key: PrKey
    let detail: PrDetail
    @State private var showResolved = false

    var body: some View {
        let conversation = app.focus.conversations[key.key]
        let comments = PrComments(conversation: conversation, reviews: detail.reviews)
        VStack(alignment: .leading, spacing: 0) {
            PrSectionLabel(title: "Comments", trailing: comments.count > 0 ? "\(comments.count)" : nil)
            if conversation == nil {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 20)
            } else if comments.isEmpty {
                Text("No comments yet.").font(.system(size: 14.5)).foregroundStyle(BD.text3).padding(.horizontal, 20)
            }
            VStack(spacing: 10) {
                ForEach(comments.open) { ReviewThreadCard(key: key, thread: $0) }
                ForEach(comments.entries) { CommentEntryCard(entry: $0) }
                if !comments.resolved.isEmpty {
                    Button { withAnimation(.snappy) { showResolved.toggle() } } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .bold))
                                .rotationEffect(.degrees(showResolved ? 90 : 0))
                            Text(comments.resolved.count == 1 ? "1 resolved thread" : "\(comments.resolved.count) resolved threads")
                        }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(BD.text2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 6)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if showResolved {
                        ForEach(comments.resolved) { ReviewThreadCard(key: key, thread: $0).opacity(0.75) }
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }
}

struct ReviewThreadCard: View {
    @Environment(AppModel.self) private var app
    let key: PrKey
    let thread: ReviewThread

    var body: some View {
        VStack(spacing: 0) {
            if let path = thread.path {
                HStack(spacing: 8) {
                    Image(systemName: "doc.text").font(.system(size: 12))
                    Text(path).lineLimit(1).truncationMode(.head)
                    Spacer(minLength: 6)
                    if let line = thread.line { Text(verbatim: "L\(line)") }
                }
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(BD.text2)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .overlay(alignment: .bottom) { Rectangle().fill(BD.separator).frame(height: 0.5) }
            }
            if let hunk = thread.diffHunk {
                ThreadDiffLines(lines: Array(UnifiedDiff.parse(hunk).filter { $0.kind != .hunk }.suffix(4)),
                                language: SyntaxHighlighter.language(for: thread.path ?? ""))
            }
            VStack(alignment: .leading, spacing: 12) {
                ForEach(thread.comments) { CommentBody(author: $0.author, at: $0.at, markdown: $0.body) }
            }
            .padding(.horizontal, 14)
            .padding(.top, 11)
            .padding(.bottom, 12)
            if !thread.isResolved {
                HStack(spacing: 0) {
                    Button { Task { await app.focus.resolve(key, threadId: thread.id) } } label: {
                        Text(app.busy.contains("resolve-\(thread.id)") ? "Resolving…" : "Resolve").frame(maxWidth: .infinity, minHeight: 42)
                    }
                    Rectangle().fill(BD.separator).frame(width: 0.5, height: 42)
                    Button { app.focus.replyTarget[key.key] = .thread(thread.id, name: thread.comments.last?.author.firstName ?? "") } label: {
                        Text("Reply").frame(maxWidth: .infinity, minHeight: 42)
                    }
                }
                .buttonStyle(.plain)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(BD.accentText)
                .overlay(alignment: .top) { Rectangle().fill(BD.separator).frame(height: 0.5) }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .bdCard(radius: 20)
    }
}

/// The few lines a thread was left on, one row each: number, marker, code cut off at the card's edge.
struct ThreadDiffLines: View {
    let lines: [DiffLine]
    let language: SyntaxHighlighter.Language

    var body: some View {
        VStack(spacing: 0) {
            ForEach(lines) { line in
                HStack(spacing: 0) {
                    Text(line.number.map(String.init) ?? "").frame(width: 28, alignment: .trailing).padding(.trailing, 6)
                    Text(line.marker).frame(width: 16, alignment: .leading)
                    Text(SyntaxHighlighter.attributed(line.text, language: language)).foregroundStyle(BD.text)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer(minLength: 0)
                }
                .foregroundStyle(line.kind == .added ? BD.green : line.kind == .removed ? BD.red : BD.text3)
                .font(.system(size: 11, design: .monospaced))
                .frame(height: 19)
                .background(line.kind == .added ? BD.greenSoft : line.kind == .removed ? BD.redSoft : .clear)
            }
        }
        .padding(.vertical, 3)
    }
}

/// A comment or review summary: as written, as the E2E report, or a bot's folded row that opens on Show.
struct CommentEntryCard: View {
    let entry: PrComments.Entry
    @State private var unfolded = false

    var body: some View {
        let presentation = CommentPresentation.of(author: entry.author, body: entry.body, isReview: entry.isReview)
        VStack(alignment: .leading, spacing: 0) {
            switch presentation {
            case .plain:
                CommentBody(author: entry.author, at: entry.at, markdown: entry.body, verdict: verdict)
                    .padding(.horizontal, 14)
                    .padding(.top, 11)
                    .padding(.bottom, 12)
                reactions
            case .e2eReport(let failed, let body):
                HStack(alignment: .top, spacing: 10) {
                    BotBadge()
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text("E2E Test Results").font(.system(size: 14.5, weight: .semibold)).foregroundStyle(BD.text)
                            if let failed, failed > 0 { ToneChip(text: "\(failed) failed", tone: .bad, small: true) }
                        }
                        GitHubMarkdown(body, size: 14)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.top, 11)
                .padding(.bottom, 12)
            case .folded(let fold):
                Button { withAnimation(.snappy) { unfolded.toggle() } } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "cpu").font(.system(size: 17)).foregroundStyle(BD.text2).frame(width: 24)
                        VStack(alignment: .leading, spacing: 1) {
                            Text("\(Text(fold.name).fontWeight(.semibold)) · \(fold.kind)")
                                .font(.system(size: 14))
                                .foregroundStyle(BD.text)
                            Text(fold.subtitle).font(.system(size: 12.5)).foregroundStyle(BD.text2).lineLimit(1)
                        }
                        Spacer(minLength: 6)
                        ToneChip(text: unfolded ? "Hide" : "Show")
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if unfolded {
                    GitHubMarkdown(entry.body, size: 14)
                        .padding(.horizontal, 14)
                        .padding(.bottom, 12)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .bdCard(radius: 20)
    }

    private var verdict: PrChip? {
        guard case .review(let review) = entry, review.state == .approved || review.state == .changesRequested else { return nil }
        return review.state.chip
    }

    @ViewBuilder
    private var reactions: some View {
        if case .comment(let comment) = entry, !comment.reactions.isEmpty {
            HStack(spacing: 8) {
                ForEach(comment.reactions, id: \.self) { reaction in
                    Text(verbatim: "\(ReactionContent.emoji(reaction.content)) \(reaction.count)")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(BD.text2)
                        .padding(.horizontal, 9)
                        .frame(height: 26)
                        .background(BD.fill, in: Capsule())
                }
            }
            .padding(.leading, 54)
            .padding(.bottom, 12)
        }
    }
}

/// The round grey bot mark in front of a report.
struct BotBadge: View {
    var body: some View {
        Image(systemName: "cpu")
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(.white)
            .frame(width: 30, height: 30)
            .background(BD.text3, in: Circle())
            .accessibilityHidden(true)
    }
}

/// Avatar, name, age and the rendered body.
struct CommentBody: View {
    let author: Person
    let at: String
    let markdown: String
    var verdict: PrChip?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            PersonBadge(person: author, size: 30).padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(author.displayName).font(.system(size: 14.5, weight: .semibold)).foregroundStyle(BD.text)
                    Text(ShortTime.age(at)).font(.system(size: 12.5)).foregroundStyle(BD.text3)
                    if let verdict { PrChipView(chip: verdict, small: true).alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 } }
                }
                GitHubMarkdown(markdown, size: 14)
            }
        }
    }
}

/// Where a comment goes: a reply in a review thread, or the conversation.
enum ReplyTarget: Hashable {
    case conversation
    case thread(String, name: String)
}

/// The glass composer at the bottom while the comments are on screen: keyboard or dictation, send.
struct CommentComposer: View {
    @Environment(AppModel.self) private var app
    let key: PrKey
    let detail: PrDetail
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        let target = app.focus.replyTarget[key.key] ?? .conversation
        let busy = app.busy.contains("comment-\(key.key)")
        HStack(spacing: 8) {
            if case .thread = target {
                Button { app.focus.replyTarget[key.key] = nil } label: {
                    Image(systemName: "xmark.circle.fill").font(.system(size: 20)).foregroundStyle(BD.text3)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Comment on the pull request instead")
            }
            TextField(placeholder(target), text: $text, axis: .vertical)
                .lineLimit(1...5)
                .font(.system(size: 16))
                .focused($focused)
            Button { send(target) } label: {
                Image(systemName: busy ? "ellipsis" : "arrow.up")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 42, height: 42)
                    .background(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? BD.text3 : BD.accent, in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityLabel("Send")
        }
        .padding(.leading, 20)
        .padding(.trailing, 6)
        .padding(.vertical, 6)
        .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 27, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
        .onChange(of: target) { if case .thread = target { focused = true } }
    }

    private func placeholder(_ target: ReplyTarget) -> String {
        switch target {
        case .thread(_, let name): return name.isEmpty ? "Reply…" : "Reply to \(name)…"
        case .conversation:
            let last = app.focus.conversations[key.key]?.comments.max { $0.at < $1.at }
            if let last, !app.focus.myLogins.contains(last.author.login), !BotAuthor.isBot(last.author.login) { return "Reply to \(last.author.firstName)…" }
            return "Comment on #\(detail.number)…"
        }
    }

    private func send(_ target: ReplyTarget) {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        let threadId: String? = if case .thread(let id, _) = target { id } else { nil }
        Task {
            if await app.focus.postComment(key, body: body, threadId: threadId) {
                text = ""
                focused = false
                app.focus.replyTarget[key.key] = nil
            }
        }
    }
}
